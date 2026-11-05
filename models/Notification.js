import mongoose from 'mongoose';
import { NOTIFICATION_STATUSES, NOTIFICATION_TYPES } from '../utils/constants.js';

const { ObjectId } = mongoose.Schema.Types;

/**
 * In-app notifications and reminders.
 *
 * SERVICE_DUE and WARRANTY_EXPIRY reminders are generated from stored dates by
 * services/reminderService.js. `key` identifies the event a reminder is about,
 * so marking a reminder Completed or Dismissed is remembered between visits.
 */
const notificationSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    asset: { type: ObjectId, ref: 'Asset', default: null },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPES), required: true },
    key: { type: String, required: true },
    title: { type: String, required: true, maxlength: 160 },
    message: { type: String, maxlength: 500 },
    reminderDate: { type: Date, default: null },
    status: { type: String, enum: NOTIFICATION_STATUSES, default: 'Pending' },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

notificationSchema.index({ user: 1, key: 1 }, { unique: true });
notificationSchema.index({ user: 1, status: 1, reminderDate: 1 });

export const Notification = mongoose.model('Notification', notificationSchema);
