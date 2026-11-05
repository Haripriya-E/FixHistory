import { Asset, MaintenanceRecord, Notification } from '../models/index.js';
import { getOwnedAssetIds, serializeAsset } from '../services/assetService.js';
import { decorateNotification, syncReminders } from '../services/reminderService.js';
import { getDashboardCharts, getDashboardStats } from '../services/statsService.js';
import { REMINDER_TYPES } from '../utils/constants.js';
import { sendSuccess } from '../utils/response.js';

/** GET /api/dashboard/stats - the six summary cards */
export async function stats(req, res) {
  sendSuccess(res, await getDashboardStats(req.user._id));
}

/** GET /api/dashboard/charts - data for the four dashboard charts */
export async function charts(req, res) {
  sendSuccess(res, await getDashboardCharts(req.user._id));
}

/** GET /api/dashboard/recent-activity - recent assets, recent records and upcoming reminders */
export async function recentActivity(req, res) {
  await syncReminders(req.user._id);
  const assetIds = await getOwnedAssetIds(req.user._id);

  const [recentAssets, recentRecords, reminders] = await Promise.all([
    Asset.find({ currentOwner: req.user._id }).sort({ createdAt: -1 }).limit(5),
    MaintenanceRecord.find({ asset: { $in: assetIds } })
      .sort({ serviceDate: -1, createdAt: -1 })
      .limit(6)
      .populate('asset', 'name assetId category'),
    Notification.find({ user: req.user._id, status: 'Pending', type: { $in: REMINDER_TYPES } })
      .sort({ reminderDate: 1 })
      .limit(6)
      .populate('asset', 'name assetId'),
  ]);

  sendSuccess(res, {
    recentAssets: recentAssets.map((asset) => serializeAsset(asset)),
    recentRecords,
    reminders: reminders.map(decorateNotification),
  });
}
