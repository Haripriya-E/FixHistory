import { env } from '../config/env.js';
import {
  Asset,
  MaintenanceRecord,
  Notification,
  OwnershipHistory,
  TransferRequest,
} from '../models/index.js';
import { deleteUploadedFile, sendStoredFile, toFileMeta } from '../middleware/upload.js';
import {
  createUniqueAssetCode,
  findOwnedAsset,
  getMaintenanceSummaries,
  serializeAsset,
} from '../services/assetService.js';
import { publicPassportUrl, qrDataUrl, qrPngBuffer } from '../services/qrService.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex, generatePublicToken } from '../utils/codes.js';
import { warrantyStatusFilter } from '../utils/dates.js';
import { buildPagination, sendSuccess } from '../utils/response.js';

const EDITABLE_FIELDS = [
  'name',
  'category',
  'brand',
  'model',
  'serialNumber',
  'purchaseDate',
  'purchasePrice',
  'warrantyStart',
  'warrantyExpiry',
  'seller',
  'description',
];

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  name: { name: 1 },
  purchaseDate: { purchaseDate: -1 },
  price_desc: { purchasePrice: -1 },
  price_asc: { purchasePrice: 1 },
};

/** GET /api/assets  - search, filter, sort and paginate the user's assets */
export async function listAssets(req, res) {
  const { page, limit, search, category, warranty, sort } = req.validatedQuery;
  const filter = { currentOwner: req.user._id };
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { brand: rx }, { model: rx }, { assetId: rx }, { serialNumber: rx }];
  }
  if (category) filter.category = category;
  if (warranty) Object.assign(filter, warrantyStatusFilter(warranty, env.reminderWindowDays));

  const [assets, total] = await Promise.all([
    Asset.find(filter)
      .sort({ ...SORTS[sort], _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Asset.countDocuments(filter),
  ]);
  const summaries = await getMaintenanceSummaries(assets.map((a) => a._id));

  sendSuccess(res, {
    items: assets.map((asset) => serializeAsset(asset, summaries.get(String(asset._id)))),
    pagination: buildPagination(page, limit, total),
  });
}

/** GET /api/assets/options - short list used by drop-down menus */
export async function listAssetOptions(req, res) {
  const assets = await Asset.find({ currentOwner: req.user._id })
    .select('name assetId category brand model')
    .sort({ name: 1 })
    .lean();
  sendSuccess(res, assets);
}

/** POST /api/assets */
export async function createAsset(req, res) {
  const data = {};
  for (const field of EDITABLE_FIELDS) if (req.body[field] !== undefined) data[field] = req.body[field];

  const asset = await Asset.create({
    ...data,
    assetId: await createUniqueAssetCode(),
    currentOwner: req.user._id,
    registeredBy: req.user._id,
    image: toFileMeta(req.file),
    publicPassport: { token: generatePublicToken() },
  });

  await OwnershipHistory.create({
    asset: asset._id,
    previousOwner: null,
    newOwner: req.user._id,
    newOwnerName: req.user.name,
    transferDate: asset.createdAt,
    transferStatus: 'Registered',
  });

  sendSuccess(res, serializeAsset(asset), { status: 201, message: 'Asset added.' });
}

/** GET /api/assets/:id - full passport data for the owner */
export async function getAsset(req, res) {
  const asset = await findOwnedAsset(req.user._id, req.params.id);
  await asset.populate('currentOwner', 'name email');

  const [records, history, pendingTransfer] = await Promise.all([
    MaintenanceRecord.find({ asset: asset._id })
      .sort({ serviceDate: -1, createdAt: -1 })
      .populate('createdBy', 'name'),
    OwnershipHistory.find({ asset: asset._id }).sort({ transferDate: 1, createdAt: 1 }),
    TransferRequest.findOne({ asset: asset._id, status: 'Pending', expiresAt: { $gt: new Date() } }).select(
      'newOwnerEmail expiresAt createdAt message',
    ),
  ]);

  const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
  const summary = {
    recordCount: records.length,
    totalCost,
    lastServiceDate: records[0]?.serviceDate || null,
    nextServiceDate: records[0]?.nextServiceDate || null,
  };

  sendSuccess(res, {
    asset: serializeAsset(asset, summary),
    records: records.map((r) => {
      const json = r.toJSON();
      json.hasInvoice = Boolean(r.invoice?.filename);
      return json;
    }),
    ownershipHistory: history,
    pendingTransfer,
  });
}

/** PUT /api/assets/:id - replaces all editable fields */
export async function updateAsset(req, res) {
  const asset = await findOwnedAsset(req.user._id, req.params.id);
  for (const field of EDITABLE_FIELDS) asset[field] = req.body[field] ?? undefined;

  const oldImage = asset.image;
  if (req.file) asset.image = toFileMeta(req.file);
  else if (req.body.removeImage) asset.image = null;

  await asset.save();
  if (oldImage && (req.file || req.body.removeImage)) await deleteUploadedFile('assets', oldImage);

  sendSuccess(res, serializeAsset(asset), { message: 'Asset updated.' });
}

/** DELETE /api/assets/:id - removes the asset, its records and uploaded files */
export async function deleteAsset(req, res) {
  const asset = await findOwnedAsset(req.user._id, req.params.id);
  const records = await MaintenanceRecord.find({ asset: asset._id }).select('invoice');

  await Promise.all([
    MaintenanceRecord.deleteMany({ asset: asset._id }),
    Notification.deleteMany({ asset: asset._id }),
    TransferRequest.deleteMany({ asset: asset._id }),
    OwnershipHistory.deleteMany({ asset: asset._id }),
  ]);
  await asset.deleteOne();

  await Promise.all([
    deleteUploadedFile('assets', asset.image),
    ...records.map((r) => deleteUploadedFile('invoices', r.invoice)),
  ]);

  sendSuccess(res, null, { message: 'Asset deleted.' });
}

/** GET /api/assets/:id/image - owner-only image download */
export async function getAssetImage(req, res) {
  const asset = await findOwnedAsset(req.user._id, req.params.id);
  if (!asset.image?.filename) throw ApiError.notFound('This asset has no image.');
  sendStoredFile(res, 'assets', asset.image);
}

function sharingSettings(asset) {
  const { enabled, showImage, showPurchaseInfo, showWarranty, showServiceHistory, showServiceCosts } =
    asset.publicPassport;
  return { enabled, showImage, showPurchaseInfo, showWarranty, showServiceHistory, showServiceCosts };
}

/**
 * GET /api/assets/:id/qr
 * Returns the QR code (as a PNG data URL) that opens the controlled public passport.
 * Add ?download=1 to download it as a PNG file.
 */
export async function getAssetQr(req, res) {
  const asset = await findOwnedAsset(req.user._id, req.params.id);
  const url = publicPassportUrl(asset.publicPassport.token);

  if (req.query.download) {
    const png = await qrPngBuffer(url);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${asset.assetId}-qr.png"`);
    return res.send(png);
  }

  return sendSuccess(res, {
    url,
    qrDataUrl: await qrDataUrl(url),
    settings: sharingSettings(asset),
  });
}

/** PUT /api/assets/:id/sharing - owner chooses what the public QR view shows */
export async function updateSharing(req, res) {
  const asset = await findOwnedAsset(req.user._id, req.params.id);
  Object.assign(asset.publicPassport, req.body);
  await asset.save();
  sendSuccess(res, { settings: sharingSettings(asset) }, { message: 'Sharing settings saved.' });
}

/** POST /api/assets/:id/sharing/regenerate - new link; old QR codes stop working */
export async function regeneratePublicLink(req, res) {
  const asset = await findOwnedAsset(req.user._id, req.params.id);
  asset.publicPassport.token = generatePublicToken();
  await asset.save();
  const url = publicPassportUrl(asset.publicPassport.token);
  sendSuccess(
    res,
    { url, qrDataUrl: await qrDataUrl(url), settings: sharingSettings(asset) },
    { message: 'A new QR code was created. Old QR codes no longer work.' },
  );
}
