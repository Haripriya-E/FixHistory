import { env } from '../config/env.js';
import { Asset, MaintenanceRecord, OwnershipHistory } from '../models/index.js';
import { SERVICE_TYPES } from '../utils/constants.js';
import { getWarrantyInfo } from '../utils/dates.js';
import { getMaintenanceSummaries } from './assetService.js';
import { getDashboardStats, getMonthlyExpenses } from './statsService.js';

/** Collects everything shown in the full report (JSON summary and PDF). */
export async function buildSummaryReport(user) {
  const assets = await Asset.find({ currentOwner: user._id }).sort({ name: 1 }).lean();
  const assetIds = assets.map((a) => a._id);

  const [summaries, records, monthly, stats] = await Promise.all([
    getMaintenanceSummaries(assetIds),
    MaintenanceRecord.find({ asset: { $in: assetIds } })
      .sort({ serviceDate: -1, createdAt: -1 })
      .populate('asset', 'name assetId category')
      .lean(),
    getMonthlyExpenses(assetIds, 12),
    getDashboardStats(user._id),
  ]);

  const assetRows = assets.map((asset) => {
    const summary = summaries.get(String(asset._id));
    return {
      _id: asset._id,
      assetId: asset.assetId,
      name: asset.name,
      category: asset.category,
      brand: asset.brand || '',
      model: asset.model || '',
      purchaseDate: asset.purchaseDate || null,
      purchasePrice: asset.purchasePrice ?? null,
      warrantyStart: asset.warrantyStart || null,
      warrantyExpiry: asset.warrantyExpiry || null,
      warranty: getWarrantyInfo(asset.warrantyExpiry, env.reminderWindowDays),
      recordCount: summary?.recordCount || 0,
      totalExpense: summary?.totalCost || 0,
      lastServiceDate: summary?.lastServiceDate || null,
      nextServiceDate: summary?.nextServiceDate || null,
      isSample: asset.isSample,
    };
  });

  const byType = SERVICE_TYPES.map((type) => {
    const ofType = records.filter((r) => r.serviceType === type);
    return { type, count: ofType.length, total: ofType.reduce((sum, r) => sum + (r.cost || 0), 0) };
  });

  const maintenance = records.map((r) => ({
    _id: r._id,
    serviceDate: r.serviceDate,
    serviceType: r.serviceType,
    asset: r.asset ? { _id: r.asset._id, name: r.asset.name, assetId: r.asset.assetId } : null,
    workPerformed: r.workPerformed,
    serviceProvider: r.serviceProvider || '',
    technician: r.technician || '',
    cost: r.cost || 0,
    nextServiceDate: r.nextServiceDate || null,
  }));

  return {
    generatedAt: new Date(),
    owner: { name: user.name, email: user.email },
    totals: {
      assets: stats.totalAssets,
      records: stats.totalRecords,
      totalExpenses: stats.totalExpenses,
      averageCostPerRecord: stats.totalRecords ? stats.totalExpenses / stats.totalRecords : 0,
      upcomingServices: stats.upcomingServices,
      overdueServices: stats.overdueServices,
    },
    warranty: {
      active: stats.activeWarranties - stats.expiringWarranties,
      expiring: stats.expiringWarranties,
      expired: stats.expiredWarranties,
      none: stats.noWarranty,
    },
    assets: assetRows,
    assetExpenses: [...assetRows].sort((a, b) => b.totalExpense - a.totalExpense),
    monthlyExpenses: monthly,
    byType,
    maintenance,
  };
}

/** Data for the single-asset passport PDF (caller must already have checked ownership). */
export async function buildAssetReport(asset) {
  await asset.populate('currentOwner', 'name');
  const [records, history] = await Promise.all([
    MaintenanceRecord.find({ asset: asset._id }).sort({ serviceDate: -1, createdAt: -1 }).lean(),
    OwnershipHistory.find({ asset: asset._id }).sort({ transferDate: 1 }).lean(),
  ]);
  const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
  return {
    generatedAt: new Date(),
    asset,
    warranty: getWarrantyInfo(asset.warrantyExpiry, env.reminderWindowDays),
    records,
    history,
    summary: {
      recordCount: records.length,
      totalCost,
      lastServiceDate: records[0]?.serviceDate || null,
      nextServiceDate: records[0]?.nextServiceDate || null,
    },
  };
}
