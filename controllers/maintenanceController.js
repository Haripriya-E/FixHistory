import mongoose from 'mongoose';
import { Asset, MaintenanceRecord } from '../models/index.js';
import { deleteUploadedFile, sendStoredFile, toFileMeta } from '../middleware/upload.js';
import { findOwnedAsset, getOwnedAssetIds } from '../services/assetService.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex } from '../utils/codes.js';
import { buildPagination, sendSuccess } from '../utils/response.js';

const EDITABLE_FIELDS = [
  'serviceDate',
  'serviceType',
  'problemDescription',
  'workPerformed',
  'replacedParts',
  'technician',
  'serviceProvider',
  'cost',
  'nextServiceDate',
  'notes',
];

const SORTS = {
  date_desc: { serviceDate: -1, createdAt: -1 },
  date_asc: { serviceDate: 1, createdAt: 1 },
  cost_desc: { cost: -1, serviceDate: -1 },
  cost_asc: { cost: 1, serviceDate: -1 },
};

const ASSET_FIELDS = 'name assetId category brand model';

function serializeRecord(record) {
  const json = record.toJSON();
  json.hasInvoice = Boolean(record.invoice?.filename);
  return json;
}

/**
 * Loads a record only when its asset belongs to the logged-in user.
 * Access follows the asset, so a new owner sees the full history after a transfer.
 */
async function findOwnedRecord(userId, recordId) {
  if (!mongoose.isValidObjectId(recordId)) throw ApiError.notFound('Maintenance record not found.');
  const record = await MaintenanceRecord.findById(recordId);
  if (!record) throw ApiError.notFound('Maintenance record not found.');
  const owns = await Asset.exists({ _id: record.asset, currentOwner: userId });
  if (!owns) throw ApiError.notFound('Maintenance record not found.');
  return record;
}

/** GET /api/maintenance - search, filter, sort and paginate records of the user's assets */
export async function listRecords(req, res) {
  const { page, limit, search, asset, serviceType, from, to, sort } = req.validatedQuery;
  const ownedIds = await getOwnedAssetIds(req.user._id);

  const filter = { asset: { $in: ownedIds } };
  if (asset) {
    // Only allow filtering by an asset the user owns.
    filter.asset = ownedIds.some((id) => id.equals(asset)) ? new mongoose.Types.ObjectId(asset) : { $in: [] };
  }
  if (serviceType) filter.serviceType = serviceType;
  if (from || to) {
    filter.serviceDate = {};
    if (from) filter.serviceDate.$gte = from;
    if (to) filter.serviceDate.$lte = to;
  }
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    const matchingAssets = await Asset.find({ _id: { $in: ownedIds }, name: rx }).distinct('_id');
    filter.$or = [
      { workPerformed: rx },
      { problemDescription: rx },
      { serviceProvider: rx },
      { technician: rx },
      { replacedParts: rx },
      { asset: { $in: matchingAssets } },
    ];
  }

  const [records, total, totals] = await Promise.all([
    MaintenanceRecord.find(filter)
      .sort(SORTS[sort])
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('asset', ASSET_FIELDS),
    MaintenanceRecord.countDocuments(filter),
    MaintenanceRecord.aggregate([
      { $match: filter },
      { $group: { _id: null, totalCost: { $sum: { $ifNull: ['$cost', 0] } } } },
    ]),
  ]);

  sendSuccess(res, {
    items: records.map(serializeRecord),
    pagination: buildPagination(page, limit, total),
    summary: { count: total, totalCost: totals[0]?.totalCost || 0 },
  });
}

/** POST /api/maintenance */
export async function createRecord(req, res) {
  const asset = await findOwnedAsset(req.user._id, req.body.asset);
  const data = {};
  for (const field of EDITABLE_FIELDS) if (req.body[field] !== undefined) data[field] = req.body[field];

  const record = await MaintenanceRecord.create({
    ...data,
    asset: asset._id,
    createdBy: req.user._id,
    invoice: toFileMeta(req.file),
  });
  await record.populate('asset', ASSET_FIELDS);
  sendSuccess(res, serializeRecord(record), { status: 201, message: 'Service record added.' });
}

/** GET /api/maintenance/:id */
export async function getRecord(req, res) {
  const record = await findOwnedRecord(req.user._id, req.params.id);
  await record.populate([
    { path: 'asset', select: ASSET_FIELDS },
    { path: 'createdBy', select: 'name' },
  ]);
  sendSuccess(res, serializeRecord(record));
}

/** PUT /api/maintenance/:id - replaces all editable fields */
export async function updateRecord(req, res) {
  const record = await findOwnedRecord(req.user._id, req.params.id);
  // The record can be moved to another asset only if the user owns that asset too.
  if (String(record.asset) !== req.body.asset) {
    const target = await findOwnedAsset(req.user._id, req.body.asset);
    record.asset = target._id;
  }
  for (const field of EDITABLE_FIELDS) {
    record[field] = req.body[field] ?? (field === 'replacedParts' ? [] : undefined);
  }
  if (record.cost === undefined) record.cost = 0;

  const oldInvoice = record.invoice;
  if (req.file) record.invoice = toFileMeta(req.file);
  else if (req.body.removeInvoice) record.invoice = null;

  await record.save();
  if (oldInvoice && (req.file || req.body.removeInvoice)) await deleteUploadedFile('invoices', oldInvoice);

  await record.populate('asset', ASSET_FIELDS);
  sendSuccess(res, serializeRecord(record), { message: 'Service record updated.' });
}

/** DELETE /api/maintenance/:id */
export async function deleteRecord(req, res) {
  const record = await findOwnedRecord(req.user._id, req.params.id);
  await record.deleteOne();
  await deleteUploadedFile('invoices', record.invoice);
  sendSuccess(res, null, { message: 'Service record deleted.' });
}

/** GET /api/maintenance/:id/invoice - owner-only invoice view/download */
export async function getInvoice(req, res) {
  const record = await findOwnedRecord(req.user._id, req.params.id);
  if (!record.invoice?.filename) throw ApiError.notFound('This record has no invoice attached.');
  sendStoredFile(res, 'invoices', record.invoice, { download: req.query.download === '1' });
}
