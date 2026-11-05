import { z } from 'zod';
import { NOTIFICATION_STATUSES, NOTIFICATION_TYPES, WARRANTY_STATUSES } from '../utils/constants.js';
import { objectId, optionalText, searchQuery } from './common.js';

const emptyOrAll = (v) => (v === '' || v === 'all' ? undefined : v);

export const reminderListQuerySchema = z.object({
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum([...NOTIFICATION_STATUSES, 'all']).default('Pending')),
  type: z.preprocess(emptyOrAll, z.enum(Object.values(NOTIFICATION_TYPES)).optional()),
});

export const reminderUpdateSchema = z.object({
  status: z.enum(NOTIFICATION_STATUSES, { error: 'Status must be Pending, Completed or Dismissed' }),
});

export const warrantyQuerySchema = z.object({
  status: z.preprocess(emptyOrAll, z.enum(WARRANTY_STATUSES).optional()),
  search: searchQuery,
});

export const createTransferSchema = z.object({
  asset: objectId('Asset'),
  newOwnerEmail: z
    .string({ error: "New owner's email is required" })
    .trim()
    .toLowerCase()
    .min(1, "New owner's email is required")
    .pipe(z.email({ error: 'Enter a valid email address' })),
  message: optionalText('Message', 300),
});

export const transferCodeSchema = z.object({
  code: z
    .string({ error: 'Transfer code is required' })
    .trim()
    .min(1, 'Transfer code is required')
    .max(40, 'Transfer code is not valid'),
});

export const reportQuerySchema = z.object({
  asset: z.preprocess((v) => (v === '' ? undefined : v), objectId('Asset').optional()),
});
