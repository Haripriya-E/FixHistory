import mongoose from 'mongoose';
import { Notification } from '../models/index.js';
import { decorateNotification, syncReminders } from '../services/reminderService.js';
import { ApiError } from '../utils/ApiError.js';
import { NOTIFICATION_TYPES, REMINDER_TYPES } from '../utils/constants.js';
import { sendSuccess } from '../utils/response.js';

/**
 * GET /api/reminders?status=Pending|Completed|Dismissed|all&type=
 * Refreshes reminders from the stored dates, then returns them.
 */
export async function listReminders(req, res) {
  await syncReminders(req.user._id);
  const { status, type } = req.validatedQuery;

  const filter = { user: req.user._id };
  if (status !== 'all') filter.status = status;
  if (type) filter.type = type;

  const notifications = await Notification.find(filter)
    .sort({ reminderDate: 1, createdAt: -1 })
    .limit(200)
    .populate('asset', 'name assetId category');
  const items = notifications.map(decorateNotification);

  // Counts of open items for badges (always based on Pending items).
  const pending = await Notification.find({ user: req.user._id, status: 'Pending' }).select('type reminderDate');
  const decorated = pending.map(decorateNotification);
  const counts = {
    pending: decorated.length,
    overdue: decorated.filter((n) => n.type === NOTIFICATION_TYPES.SERVICE_DUE && n.isOverdue).length,
    upcomingServices: decorated.filter((n) => n.type === NOTIFICATION_TYPES.SERVICE_DUE && !n.isOverdue).length,
    warranty: decorated.filter((n) => n.type === NOTIFICATION_TYPES.WARRANTY_EXPIRY).length,
    transfers: decorated.filter((n) => n.type === NOTIFICATION_TYPES.TRANSFER).length,
  };

  // Transfer messages are newest first; dated reminders are soonest first.
  items.sort((a, b) => {
    const aReminder = REMINDER_TYPES.includes(a.type);
    const bReminder = REMINDER_TYPES.includes(b.type);
    if (aReminder !== bReminder) return aReminder ? -1 : 1;
    if (aReminder) return new Date(a.reminderDate) - new Date(b.reminderDate);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  sendSuccess(res, { items, counts });
}

/** PUT /api/reminders/:id - mark as Completed, Dismissed, or back to Pending */
export async function updateReminder(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw ApiError.notFound('Reminder not found.');
  const notification = await Notification.findOne({ _id: req.params.id, user: req.user._id });
  if (!notification) throw ApiError.notFound('Reminder not found.');

  notification.status = req.body.status;
  notification.resolvedAt = req.body.status === 'Pending' ? null : new Date();
  await notification.save();
  await notification.populate('asset', 'name assetId category');

  const labels = { Completed: 'Marked as completed.', Dismissed: 'Reminder dismissed.', Pending: 'Reminder restored.' };
  sendSuccess(res, decorateNotification(notification), { message: labels[req.body.status] });
}
