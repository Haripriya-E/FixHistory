import { env } from '../config/env.js';
import { Asset, MaintenanceRecord } from '../models/index.js';
import { ASSET_CATEGORIES, SERVICE_TYPES } from '../utils/constants.js';
import { addDays, getWarrantyInfo, monthLabel, startOfMonthUTC, todayUTC } from '../utils/dates.js';
import { getMaintenanceSummaries, getOwnedAssetIds } from './assetService.js';

/**
 * All statistics are calculated from the database on every request.
 * Nothing on the dashboard or in reports is hard-coded.
 */

export async function getWarrantyCounts(userId) {
  const assets = await Asset.find({ currentOwner: userId }).select('warrantyExpiry').lean();
  const counts = { active: 0, expiring: 0, expired: 0, none: 0 };
  for (const asset of assets) counts[getWarrantyInfo(asset.warrantyExpiry, env.reminderWindowDays).status] += 1;
  return counts;
}

/** Counts assets whose next service (from their latest record) is overdue or due soon. */
async function getServiceDueCounts(assetIds) {
  const summaries = await getMaintenanceSummaries(assetIds);
  const today = todayUTC();
  const windowEnd = addDays(today, env.reminderWindowDays);
  let upcoming = 0;
  let overdue = 0;
  for (const summary of summaries.values()) {
    if (!summary.nextServiceDate) continue;
    if (summary.nextServiceDate < today) overdue += 1;
    else if (summary.nextServiceDate <= windowEnd) upcoming += 1;
  }
  return { upcoming, overdue };
}

export async function getDashboardStats(userId) {
  const assetIds = await getOwnedAssetIds(userId);
  const [totals] = await MaintenanceRecord.aggregate([
    { $match: { asset: { $in: assetIds } } },
    { $group: { _id: null, count: { $sum: 1 }, totalCost: { $sum: { $ifNull: ['$cost', 0] } } } },
  ]);
  const [warranty, services] = await Promise.all([getWarrantyCounts(userId), getServiceDueCounts(assetIds)]);

  return {
    totalAssets: assetIds.length,
    totalRecords: totals?.count || 0,
    totalExpenses: totals?.totalCost || 0,
    upcomingServices: services.upcoming,
    overdueServices: services.overdue,
    activeWarranties: warranty.active + warranty.expiring,
    expiringWarranties: warranty.expiring,
    expiredWarranties: warranty.expired,
    noWarranty: warranty.none,
    reminderWindowDays: env.reminderWindowDays,
  };
}

/** Maintenance spending per month for the last `months` months (months without spending show 0). */
export async function getMonthlyExpenses(assetIds, months = 12) {
  const start = startOfMonthUTC(months - 1);
  const rows = await MaintenanceRecord.aggregate([
    { $match: { asset: { $in: assetIds }, serviceDate: { $gte: start } } },
    {
      $group: {
        _id: { year: { $year: '$serviceDate' }, month: { $month: '$serviceDate' } },
        total: { $sum: { $ifNull: ['$cost', 0] } },
        count: { $sum: 1 },
      },
    },
  ]);
  const byKey = new Map(rows.map((r) => [`${r._id.year}-${r._id.month}`, r]));
  const result = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const monthStart = startOfMonthUTC(i);
    const year = monthStart.getUTCFullYear();
    const month = monthStart.getUTCMonth() + 1;
    const row = byKey.get(`${year}-${month}`);
    result.push({ year, month, label: monthLabel(year, month), total: row?.total || 0, count: row?.count || 0 });
  }
  return result;
}

export async function getDashboardCharts(userId) {
  const assetIds = await getOwnedAssetIds(userId);

  const [monthlyExpenses, categoryRows, typeRows, warranty] = await Promise.all([
    getMonthlyExpenses(assetIds, 12),
    Asset.aggregate([{ $match: { currentOwner: userId } }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
    MaintenanceRecord.aggregate([
      { $match: { asset: { $in: assetIds } } },
      { $group: { _id: '$serviceType', count: { $sum: 1 }, total: { $sum: { $ifNull: ['$cost', 0] } } } },
    ]),
    getWarrantyCounts(userId),
  ]);

  const categoryMap = new Map(categoryRows.map((r) => [r._id, r.count]));
  const typeMap = new Map(typeRows.map((r) => [r._id, r]));

  return {
    monthlyExpenses,
    assetsByCategory: ASSET_CATEGORIES.map((category) => ({ category, count: categoryMap.get(category) || 0 })),
    recordsByType: SERVICE_TYPES.map((type) => ({
      type,
      count: typeMap.get(type)?.count || 0,
      total: typeMap.get(type)?.total || 0,
    })),
    warrantyStatus: [
      { status: 'active', label: 'Active', count: warranty.active },
      { status: 'expiring', label: 'Expiring soon', count: warranty.expiring },
      { status: 'expired', label: 'Expired', count: warranty.expired },
      { status: 'none', label: 'No warranty', count: warranty.none },
    ],
  };
}
