import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Asset, Notification, OwnershipHistory, TransferRequest, User } from '../models/index.js';
import { findOwnedAsset } from '../services/assetService.js';
import { notify } from '../services/reminderService.js';
import { ApiError } from '../utils/ApiError.js';
import { generateTransferCode, hashTransferCode } from '../utils/codes.js';
import { formatDate } from '../utils/dates.js';
import { sendSuccess } from '../utils/response.js';

/*
 * Ownership transfer workflow (in-app, no email required)
 *  1. The current owner creates a transfer for an asset and the new owner's email.
 *     A one-time code is shown once to the current owner (only its HMAC is stored).
 *  2. The current owner shares the code with the buyer (in person, phone, chat).
 *  3. The buyer logs in with that email, enters the code, reviews the asset
 *     summary, and confirms. Only then does ownership change.
 */

async function expireOldTransfers(filter) {
  await TransferRequest.updateMany(
    { ...filter, status: 'Pending', expiresAt: { $lte: new Date() } },
    { $set: { status: 'Expired', closedAt: new Date() } },
  );
}

const invalidCode = (message = 'This transfer code is not valid for your account.') =>
  ApiError.validation([{ field: 'code', message }], message);

/** Finds the pending transfer for a code, but only if it was addressed to this user. */
async function findTransferForRecipient(user, code) {
  const transfer = await TransferRequest.findOne({ codeHash: hashTransferCode(code) })
    .populate('asset', 'name assetId category brand model serialNumber purchaseDate')
    .populate('currentOwner', 'name');

  // Same message for "no such code" and "code for someone else" so codes cannot be probed.
  if (!transfer || transfer.newOwnerEmail !== user.email || !transfer.asset) throw invalidCode();

  if (transfer.status === 'Pending' && transfer.expiresAt <= new Date()) {
    transfer.status = 'Expired';
    transfer.closedAt = new Date();
    await transfer.save();
  }
  if (transfer.status === 'Expired') throw invalidCode('This transfer code has expired. Ask the owner for a new one.');
  if (transfer.status !== 'Pending') {
    throw invalidCode(`This transfer is no longer open (status: ${transfer.status.toLowerCase()}).`);
  }
  return transfer;
}

function previewOf(transfer) {
  const { asset } = transfer;
  return {
    transferId: transfer._id,
    fromName: transfer.currentOwner?.name,
    message: transfer.message || '',
    expiresAt: transfer.expiresAt,
    asset: {
      assetId: asset.assetId,
      name: asset.name,
      category: asset.category,
      brand: asset.brand,
      model: asset.model,
      serialLast4: asset.serialNumber ? asset.serialNumber.slice(-4) : null,
      purchaseDate: asset.purchaseDate,
    },
  };
}

/** POST /api/transfers - current owner starts a transfer and receives the code once */
export async function createTransfer(req, res) {
  const { newOwnerEmail, message } = req.body;
  const asset = await findOwnedAsset(req.user._id, req.body.asset);

  if (newOwnerEmail === req.user.email) {
    throw ApiError.validation([{ field: 'newOwnerEmail', message: 'You already own this asset.' }]);
  }

  await expireOldTransfers({ asset: asset._id });
  if (await TransferRequest.exists({ asset: asset._id, status: 'Pending' })) {
    throw ApiError.conflict('A transfer for this asset is already pending. Cancel it before creating a new code.');
  }

  const code = generateTransferCode();
  const expiresAt = new Date(Date.now() + env.transferExpiryHours * 60 * 60 * 1000);

  let transfer;
  try {
    transfer = await TransferRequest.create({
      asset: asset._id,
      currentOwner: req.user._id,
      newOwnerEmail,
      codeHash: hashTransferCode(code),
      message,
      expiresAt,
    });
  } catch (error) {
    if (error?.code === 11000) throw ApiError.conflict('A transfer for this asset is already pending.');
    throw error;
  }

  const recipient = await User.findOne({ email: newOwnerEmail }).select('_id');
  if (recipient) {
    await notify(recipient._id, {
      key: `transfer:${transfer._id}:incoming`,
      title: `${req.user.name} wants to transfer "${asset.name}" to you`,
      message: `Ask ${req.user.name} for the transfer code and enter it on the Ownership Transfer page. The code expires on ${formatDate(expiresAt)}.`,
    });
  }

  await transfer.populate('asset', 'name assetId category');
  sendSuccess(
    res,
    { transfer, code, recipientHasAccount: Boolean(recipient) },
    { status: 201, message: 'Transfer code created. Share it with the new owner.' },
  );
}

/** POST /api/transfers/preview - buyer checks a code before accepting (no changes made) */
export async function previewTransfer(req, res) {
  const transfer = await findTransferForRecipient(req.user, req.body.code);
  sendSuccess(res, previewOf(transfer));
}

/** POST /api/transfers/confirm - buyer accepts; ownership changes only now */
export async function confirmTransfer(req, res) {
  const transfer = await findTransferForRecipient(req.user, req.body.code);
  const previousOwner = transfer.currentOwner;
  const now = new Date();

  // Atomically claim the request so it can only be completed once.
  const claimed = await TransferRequest.findOneAndUpdate(
    { _id: transfer._id, status: 'Pending', expiresAt: { $gt: now } },
    { $set: { status: 'Completed', completedAt: now, closedAt: now, newOwner: req.user._id } },
    { new: true },
  );
  if (!claimed) throw ApiError.conflict('This transfer is no longer available.');

  // Move the asset only if the sender still owns it.
  const asset = await Asset.findOneAndUpdate(
    { _id: transfer.asset._id, currentOwner: previousOwner._id },
    { $set: { currentOwner: req.user._id, 'publicPassport.enabled': false } },
    { new: true },
  );
  if (!asset) {
    await TransferRequest.updateOne(
      { _id: transfer._id },
      { $set: { status: 'Cancelled', completedAt: null, newOwner: null } },
    );
    throw ApiError.conflict('The asset is no longer owned by the sender, so this transfer was cancelled.');
  }

  await OwnershipHistory.create({
    asset: asset._id,
    previousOwner: previousOwner._id,
    previousOwnerName: previousOwner.name,
    newOwner: req.user._id,
    newOwnerName: req.user.name,
    transferDate: now,
    transferStatus: 'Transferred',
    transferRequest: transfer._id,
  });

  // The previous owner's reminders for this asset no longer apply.
  await Notification.deleteMany({ user: previousOwner._id, asset: asset._id });
  await Notification.deleteMany({ user: req.user._id, key: `transfer:${transfer._id}:incoming` });

  await notify(previousOwner._id, {
    key: `transfer:${transfer._id}:completed`,
    title: `"${asset.name}" was transferred to ${req.user.name}`,
    message: `The transfer was accepted on ${formatDate(now)}. The asset and its maintenance history are no longer in your account.`,
  });
  await notify(req.user._id, {
    asset: asset._id,
    key: `transfer:${transfer._id}:received`,
    title: `You are now the owner of "${asset.name}"`,
    message: `The full maintenance history from ${previousOwner.name} is now in your account. Public QR sharing was switched off; you can turn it on from the asset passport.`,
  });

  sendSuccess(
    res,
    { asset: { _id: asset._id, assetId: asset.assetId, name: asset.name } },
    { message: 'Transfer complete. The asset is now in your account.' },
  );
}

/** GET /api/transfers - transfers I started (outgoing) and transfers addressed to me (incoming) */
export async function listTransfers(req, res) {
  await expireOldTransfers({ $or: [{ currentOwner: req.user._id }, { newOwnerEmail: req.user.email }] });

  const [outgoing, incoming] = await Promise.all([
    TransferRequest.find({ currentOwner: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('asset', 'name assetId category')
      .populate('newOwner', 'name'),
    TransferRequest.find({ newOwnerEmail: req.user.email, currentOwner: { $ne: req.user._id } })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('asset', 'name assetId category brand model')
      .populate('currentOwner', 'name'),
  ]);

  sendSuccess(res, { outgoing, incoming });
}

/** PATCH /api/transfers/:id/cancel - the sender withdraws a pending transfer */
export async function cancelTransfer(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw ApiError.notFound('Transfer not found.');
  const transfer = await TransferRequest.findOneAndUpdate(
    { _id: req.params.id, currentOwner: req.user._id, status: 'Pending' },
    { $set: { status: 'Cancelled', closedAt: new Date() } },
    { new: true },
  );
  if (!transfer) throw ApiError.notFound('No pending transfer found to cancel.');
  await Notification.deleteMany({ key: `transfer:${transfer._id}:incoming` });
  sendSuccess(res, transfer, { message: 'Transfer cancelled. The code no longer works.' });
}

/** PATCH /api/transfers/:id/reject - the recipient declines a pending transfer */
export async function rejectTransfer(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw ApiError.notFound('Transfer not found.');
  const transfer = await TransferRequest.findOneAndUpdate(
    { _id: req.params.id, newOwnerEmail: req.user.email, status: 'Pending' },
    { $set: { status: 'Rejected', closedAt: new Date() } },
    { new: true },
  ).populate('asset', 'name');
  if (!transfer) throw ApiError.notFound('No pending transfer found to decline.');

  await Notification.deleteMany({ user: req.user._id, key: `transfer:${transfer._id}:incoming` });
  await notify(transfer.currentOwner, {
    key: `transfer:${transfer._id}:rejected`,
    title: `Transfer of "${transfer.asset?.name || 'an asset'}" was declined`,
    message: `${req.user.name} declined the transfer. The asset remains in your account.`,
  });
  sendSuccess(res, transfer, { message: 'Transfer declined.' });
}
