import { env } from '../config/env.js';
import { Asset } from '../models/index.js';
import { getWarrantyCounts } from '../services/statsService.js';
import { escapeRegex } from '../utils/codes.js';
import { getWarrantyInfo, warrantyStatusFilter } from '../utils/dates.js';
import { sendSuccess } from '../utils/response.js';

/**
 * GET /api/warranty
 * Warranty status is calculated from the stored expiry date on every request.
 */
export async function listWarranties(req, res) {
  const { status, search } = req.validatedQuery;
  const filter = { currentOwner: req.user._id };
  if (status) Object.assign(filter, warrantyStatusFilter(status, env.reminderWindowDays));
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { brand: rx }, { model: rx }, { assetId: rx }];
  }

  const assets = await Asset.find(filter)
    .select('assetId name category brand model warrantyStart warrantyExpiry seller purchaseDate')
    .lean();

  const items = assets
    .map((asset) => ({ ...asset, warranty: getWarrantyInfo(asset.warrantyExpiry, env.reminderWindowDays) }))
    // Soonest expiry first; assets without a warranty go last.
    .sort((a, b) => {
      if (!a.warrantyExpiry) return 1;
      if (!b.warrantyExpiry) return -1;
      return a.warrantyExpiry - b.warrantyExpiry;
    });

  sendSuccess(res, {
    items,
    counts: await getWarrantyCounts(req.user._id),
    windowDays: env.reminderWindowDays,
  });
}
