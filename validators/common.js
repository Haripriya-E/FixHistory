import { z } from 'zod';
import mongoose from 'mongoose';

/**
 * Reusable Zod helpers.
 * Forms are sent as multipart/form-data, so every value arrives as a string.
 * Empty strings are treated as "not provided".
 */
const emptyToUndefined = (value) =>
  value === '' || value === null || value === 'null' || value === 'undefined' ? undefined : value;

export const requiredText = (label, max) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

export const optionalText = (label, max) =>
  z.preprocess(
    emptyToUndefined,
    z.string().trim().max(max, `${label} must be ${max} characters or fewer`).optional(),
  );

export const optionalDate = (label) =>
  z.preprocess(emptyToUndefined, z.coerce.date({ error: `${label} must be a valid date` }).optional());

export const requiredDate = (label) =>
  z.preprocess(emptyToUndefined, z.coerce.date({ error: `${label} is required` }));

export const optionalAmount = (label) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ error: `${label} must be a number` })
      .min(0, `${label} cannot be negative`)
      .max(1_000_000_000, `${label} is too large`)
      .optional(),
  );

export const booleanFlag = z.preprocess((value) => {
  if (value === 'true' || value === true || value === '1' || value === 1) return true;
  if (value === 'false' || value === false || value === '0' || value === 0) return false;
  return value;
}, z.boolean({ error: 'Must be true or false' }));

export const objectId = (label = 'ID') =>
  z.string({ error: `${label} is required` }).refine((v) => mongoose.isValidObjectId(v), `${label} is not valid`);

export const pageQuery = {
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(12)),
};

export const searchQuery = z.preprocess(emptyToUndefined, z.string().trim().max(100).optional());

/** Accepts "a, b, c" (form field) or ["a", "b"] (JSON) and returns a clean string array. */
export const stringList = (label, maxItems, maxLength) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === '') return [];
      const list = Array.isArray(value) ? value : String(value).split(/[,\n]/);
      return list.map((item) => String(item).trim()).filter(Boolean);
    },
    z
      .array(z.string().max(maxLength, `Each ${label} entry must be ${maxLength} characters or fewer`))
      .max(maxItems, `Add at most ${maxItems} ${label} entries`),
  );
