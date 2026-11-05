import { env } from '../config/env.js';
import { Asset, MaintenanceRecord, Notification } from '../models/index.js';
import { NOTIFICATION_TYPES, REMINDER_TYPES } from '../utils/constants.js';
import { addDays, daysBetween, formatDate, todayUTC } from '../utils/dates.js';

/**
 * Builds the reminders that should exist right now from the stored dates:
 *   - a service reminder for each asset whose latest service record has a
 *     next service date that is overdue or due within the reminder window
 *   - a warranty reminder for each warranty expiring within the window
 *
 * Each reminder has a stable `key`, so its status (Pending / Completed /
 * Dismissed) is kept between visits. Pending reminders whose condition no
 * longer applies (for example the record was edited) are removed.
 *
 * No email or SMS is sent: reminders are shown inside the application only.
 */
export async function syncReminders(userId) {
  const today = todayUTC();
  const windowEnd = addDays(today, env.reminderWindowDays);

  const assets = await Asset.find({ currentOwner: userId }).select('_id name warrantyExpiry').lean();
  const assetIds = assets.map((a) => a._id);
  const assetById = new Map(assets.map((a) => [String(a._id), a]));

  const latestRecords = assetIds.length
    ? await MaintenanceRecord.aggregate([
        { $match: { asset: { $in: assetIds } } },
        { $sort: { serviceDate: -1, createdAt: -1 } },
        {
          $group: {
            _id: '$asset',
            recordId: { $first: '$_id' },
            serviceDate: { $first: '$serviceDate' },
            serviceType: { $first: '$serviceType' },
            nextServiceDate: { $first: '$nextServiceDate' },
          },
        },
      ])
    : [];

  const desired = [];

  for (const record of latestRecords) {
    if (!record.nextServiceDate || record.nextServiceDate > windowEnd) continue;
    const asset = assetById.get(String(record._id));
    const dateKey = record.nextServiceDate.toISOString().slice(0, 10);
    desired.push({
      key: `service:${record.recordId}:${dateKey}`,
      type: NOTIFICATION_TYPES.SERVICE_DUE,
      asset: record._id,
      title: `Service due for ${asset.name}`,
      message: `The ${record.serviceType.toLowerCase()} on ${formatDate(record.serviceDate)} recommended the next service on ${formatDate(record.nextServiceDate)}.`,
      reminderDate: record.nextServiceDate,
    });
  }

  for (const asset of assets) {
    if (!asset.warrantyExpiry || asset.warrantyExpiry < today || asset.warrantyExpiry > windowEnd) continue;
    const dateKey = asset.warrantyExpiry.toISOString().slice(0, 10);
    desired.push({
      key: `warranty:${asset._id}:${dateKey}`,
      type: NOTIFICATION_TYPES.WARRANTY_EXPIRY,
      asset: asset._id,
      title: `Warranty ending for ${asset.name}`,
      message: `The warranty expires on ${formatDate(asset.warrantyExpiry)}. Book any warranty repairs before this date.`,
      reminderDate: asset.warrantyExpiry,
    });
  }

  if (desired.length) {
    await upsertReminders(userId, desired);
  }

  await Notification.deleteMany({
    user: userId,
    type: { $in: REMINDER_TYPES },
    status: 'Pending',
    key: { $nin: desired.map((r) => r.key) },
  });
}

async function upsertReminders(userId, desired) {
  try {
    await Notification.bulkWrite(
      desired.map((reminder) => ({
        updateOne: {
          filter: { user: userId, key: reminder.key },
          update: {
            $set: {
              title: reminder.title,
              message: reminder.message,
              reminderDate: reminder.reminderDate,
              asset: reminder.asset,
              type: reminder.type,
            },
            $setOnInsert: { status: 'Pending' },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  } catch (error) {
    // Two requests syncing at the same moment can race to insert the same
    // reminder; the unique index keeps one copy, so the duplicate is harmless.
    const duplicateOnly = error?.code === 11000 || error?.writeErrors?.every((e) => e.code === 11000);
    if (!duplicateOnly) throw error;
  }
}

/** Adds overdue / days-left information calculated at read time. */
export function decorateNotification(notification) {
  const json = typeof notification.toJSON === 'function' ? notification.toJSON() : { ...notification };
  if (json.reminderDate && REMINDER_TYPES.includes(json.type)) {
    const daysUntil = daysBetween(todayUTC(), json.reminderDate);
    json.daysUntil = daysUntil;
    json.isOverdue = daysUntil < 0;
  } else {
    json.daysUntil = null;
    json.isOverdue = false;
  }
  return json;
}

/** Creates a one-off informational notification (used by ownership transfers). */
export async function notify(userId, { asset = null, key, title, message }) {
  await Notification.updateOne(
    { user: userId, key },
    {
      $set: { title, message, asset, type: NOTIFICATION_TYPES.TRANSFER, reminderDate: new Date() },
      $setOnInsert: { status: 'Pending' },
    },
    { upsert: true },
  );
}
