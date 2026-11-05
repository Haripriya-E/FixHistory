import { z } from 'zod';
import { SERVICE_TYPES } from '../utils/constants.js';
import { todayUTC } from '../utils/dates.js';
import {
  booleanFlag,
  objectId,
  optionalAmount,
  optionalDate,
  optionalText,
  pageQuery,
  requiredDate,
  requiredText,
  searchQuery,
  stringList,
} from './common.js';

export const maintenanceBodySchema = z
  .object({
    asset: objectId('Asset'),
    serviceDate: requiredDate('Service date'),
    serviceType: z.enum(SERVICE_TYPES, { error: 'Choose a valid service type' }),
    problemDescription: optionalText('Problem description', 1000),
    workPerformed: requiredText('Work performed', 2000),
    replacedParts: stringList('replaced part', 30, 80),
    technician: optionalText('Technician name', 80),
    serviceProvider: optionalText('Service provider', 100),
    cost: optionalAmount('Service cost'),
    nextServiceDate: optionalDate('Next service date'),
    notes: optionalText('Notes', 1000),
    removeInvoice: booleanFlag.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.serviceDate > todayUTC()) {
      ctx.addIssue({
        code: 'custom',
        path: ['serviceDate'],
        message: 'Service date cannot be in the future. Use "Next service date" for planned services.',
      });
    }
    if (data.nextServiceDate && data.nextServiceDate <= data.serviceDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['nextServiceDate'],
        message: 'Next service date must be after the service date',
      });
    }
  });

const emptyToUndefined = (v) => (v === '' || v === 'all' ? undefined : v);

export const maintenanceListQuerySchema = z
  .object({
    ...pageQuery,
    limit: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(100).default(20)),
    search: searchQuery,
    asset: z.preprocess(emptyToUndefined, objectId('Asset').optional()),
    serviceType: z.preprocess(emptyToUndefined, z.enum(SERVICE_TYPES).optional()),
    from: optionalDate('From date'),
    to: optionalDate('To date'),
    sort: z.enum(['date_desc', 'date_asc', 'cost_desc', 'cost_asc']).optional().default('date_desc'),
  })
  .refine((q) => !(q.from && q.to && q.to < q.from), { path: ['to'], message: '"To" date must be after "From" date' });
