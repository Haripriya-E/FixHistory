import { z } from 'zod';
import { ASSET_CATEGORIES, WARRANTY_STATUSES } from '../utils/constants.js';
import { todayUTC } from '../utils/dates.js';
import {
  booleanFlag,
  optionalAmount,
  optionalDate,
  optionalText,
  pageQuery,
  requiredText,
  searchQuery,
} from './common.js';

/**
 * Used for both create (POST) and update (PUT). PUT replaces all editable
 * fields, so an empty optional field clears the stored value.
 */
export const assetBodySchema = z
  .object({
    name: requiredText('Asset name', 100),
    category: z.enum(ASSET_CATEGORIES, { error: 'Choose a valid category' }),
    brand: optionalText('Brand', 60),
    model: optionalText('Model', 60),
    serialNumber: optionalText('Serial number', 80),
    purchaseDate: optionalDate('Purchase date'),
    purchasePrice: optionalAmount('Purchase price'),
    warrantyStart: optionalDate('Warranty start date'),
    warrantyExpiry: optionalDate('Warranty expiry date'),
    seller: optionalText('Seller', 100),
    description: optionalText('Description', 1000),
    removeImage: booleanFlag.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.purchaseDate && data.purchaseDate > todayUTC()) {
      ctx.addIssue({ code: 'custom', path: ['purchaseDate'], message: 'Purchase date cannot be in the future' });
    }
    if (data.warrantyStart && data.warrantyExpiry && data.warrantyExpiry < data.warrantyStart) {
      ctx.addIssue({
        code: 'custom',
        path: ['warrantyExpiry'],
        message: 'Warranty expiry must be on or after the warranty start date',
      });
    }
    if (data.warrantyStart && !data.warrantyExpiry) {
      ctx.addIssue({
        code: 'custom',
        path: ['warrantyExpiry'],
        message: 'Add the warranty expiry date (or clear the start date)',
      });
    }
  });

export const assetListQuerySchema = z.object({
  ...pageQuery,
  search: searchQuery,
  category: z.preprocess((v) => (v === '' || v === 'all' ? undefined : v), z.enum(ASSET_CATEGORIES).optional()),
  warranty: z.preprocess((v) => (v === '' || v === 'all' ? undefined : v), z.enum(WARRANTY_STATUSES).optional()),
  sort: z
    .enum(['newest', 'oldest', 'name', 'purchaseDate', 'price_desc', 'price_asc'])
    .optional()
    .default('newest'),
});

export const sharingSchema = z.object({
  enabled: booleanFlag,
  showImage: booleanFlag,
  showPurchaseInfo: booleanFlag,
  showWarranty: booleanFlag,
  showServiceHistory: booleanFlag,
  showServiceCosts: booleanFlag,
});
