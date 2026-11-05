import { env } from '../config/env.js';
import { Asset, MaintenanceRecord, OwnershipHistory } from '../models/index.js';
import { sendStoredFile } from '../middleware/upload.js';
import { ApiError } from '../utils/ApiError.js';
import { getWarrantyInfo } from '../utils/dates.js';
import { sendSuccess } from '../utils/response.js';

/*
 * Public QR passport.
 * Never returned here: owner names or emails, invoices, notes, technician
 * names, problem descriptions or the full serial number. Everything else is
 * shown only if the owner switched it on in the sharing settings.
 */

const NOT_AVAILABLE = 'This passport is private or the link is no longer valid.';

async function findPublicAsset(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 64) throw ApiError.notFound(NOT_AVAILABLE);
  const asset = await Asset.findOne({ 'publicPassport.token': token });
  // Disabled and unknown links get the same response.
  if (!asset || !asset.publicPassport.enabled) throw ApiError.notFound(NOT_AVAILABLE);
  return asset;
}

const maskSerial = (serial) => (serial ? `${'*'.repeat(Math.max(0, Math.min(serial.length - 4, 8)))}${serial.slice(-4)}` : null);

/** GET /api/public/passport/:token */
export async function getPublicPassport(req, res) {
  const asset = await findPublicAsset(req.params.token);
  const settings = asset.publicPassport;

  const [records, ownerCount] = await Promise.all([
    MaintenanceRecord.find({ asset: asset._id })
      .sort({ serviceDate: -1, createdAt: -1 })
      .select('serviceDate serviceType workPerformed replacedParts serviceProvider cost')
      .lean(),
    OwnershipHistory.countDocuments({ asset: asset._id }),
  ]);

  const passport = {
    assetId: asset.assetId,
    name: asset.name,
    category: asset.category,
    brand: asset.brand || null,
    model: asset.model || null,
    serialMasked: maskSerial(asset.serialNumber),
    registeredOn: asset.createdAt,
    ownerCount: Math.max(1, ownerCount),
    hasImage: settings.showImage && Boolean(asset.image?.filename),
    sections: {
      purchase: settings.showPurchaseInfo,
      warranty: settings.showWarranty,
      serviceHistory: settings.showServiceHistory,
      serviceCosts: settings.showServiceHistory && settings.showServiceCosts,
    },
    serviceSummary: {
      recordCount: records.length,
      lastServiceDate: records[0]?.serviceDate || null,
    },
  };

  if (settings.showPurchaseInfo) {
    passport.purchase = { purchaseDate: asset.purchaseDate || null, seller: asset.seller || null };
  }
  if (settings.showWarranty) {
    passport.warranty = {
      warrantyStart: asset.warrantyStart || null,
      warrantyExpiry: asset.warrantyExpiry || null,
      ...getWarrantyInfo(asset.warrantyExpiry, env.reminderWindowDays),
    };
  }
  if (settings.showServiceHistory) {
    passport.serviceHistory = records.map((r) => ({
      serviceDate: r.serviceDate,
      serviceType: r.serviceType,
      workPerformed: r.workPerformed,
      replacedParts: r.replacedParts || [],
      serviceProvider: r.serviceProvider || null,
      ...(settings.showServiceCosts ? { cost: r.cost || 0 } : {}),
    }));
    if (settings.showServiceCosts) {
      passport.serviceSummary.totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
    }
  }

  // If the person scanning is the logged-in owner, offer a link to the full passport.
  const isOwner = Boolean(req.user && asset.currentOwner.equals(req.user._id));
  passport.viewer = { isOwner, assetObjectId: isOwner ? asset._id : null };

  res.setHeader('Cache-Control', 'no-store');
  sendSuccess(res, passport);
}

/** GET /api/public/passport/:token/image - only when the owner allows the photo */
export async function getPublicPassportImage(req, res) {
  const asset = await findPublicAsset(req.params.token);
  if (!asset.publicPassport.showImage || !asset.image?.filename) throw ApiError.notFound('No image available.');
  sendStoredFile(res, 'assets', asset.image);
}
