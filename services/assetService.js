import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Asset, MaintenanceRecord } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { getWarrantyInfo } from '../utils/dates.js';
import { generateAssetCode } from '../utils/codes.js';

/**
 * Loads an asset only if it belongs to the logged-in user.
 * Assets owned by someone else return 404 so their existence is not revealed.
 */
export async function findOwnedAsset(userId, assetId) {
  if (!mongoose.isValidObjectId(assetId)) throw ApiError.notFound('Asset not found.');
  const asset = await Asset.findOne({ _id: assetId, currentOwner: userId });
  if (!asset) throw ApiError.notFound('Asset not found.');
  return asset;
}

/** ObjectIds of every asset currently owned by the user. */
export function getOwnedAssetIds(userId) {
  return Asset.find({ currentOwner: userId }).distinct('_id');
}

/** Creates a unique human-readable asset code (FH-XXXXXXXX). */
export async function createUniqueAssetCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateAssetCode();
    // eslint-disable-next-line no-await-in-loop
    if (!(await Asset.exists({ assetId: code }))) return code;
  }
  throw new Error('Could not generate a unique asset ID. Please try again.');
}

/**
 * Per-asset maintenance totals for a list of asset ids.
 * Returns a Map: assetId -> { recordCount, totalCost, lastServiceDate, nextServiceDate }
 * nextServiceDate comes from the most recent service record, because a newer
 * service replaces the recommendation of an older one.
 */
export async function getMaintenanceSummaries(assetIds) {
  if (!assetIds.length) return new Map();
  const rows = await MaintenanceRecord.aggregate([
    { $match: { asset: { $in: assetIds } } },
    { $sort: { serviceDate: -1, createdAt: -1 } },
    {
      $group: {
        _id: '$asset',
        recordCount: { $sum: 1 },
        totalCost: { $sum: { $ifNull: ['$cost', 0] } },
        lastServiceDate: { $first: '$serviceDate' },
        nextServiceDate: { $first: '$nextServiceDate' },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
}

/** Plain object for API responses with calculated warranty and maintenance info. */
export function serializeAsset(asset, summary) {
  const json = typeof asset.toJSON === 'function' ? asset.toJSON() : { ...asset };
  delete json.image;
  return {
    ...json,
    hasImage: Boolean(asset.image?.filename),
    warranty: getWarrantyInfo(asset.warrantyExpiry, env.reminderWindowDays),
    maintenance: {
      recordCount: summary?.recordCount || 0,
      totalCost: summary?.totalCost || 0,
      lastServiceDate: summary?.lastServiceDate || null,
      nextServiceDate: summary?.nextServiceDate || null,
    },
  };
}
