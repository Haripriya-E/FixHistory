import { ApiError } from '../utils/ApiError.js';

/** Converts Zod issues into [{ field, message }] for the frontend. */
export function formatZodIssues(issues) {
  const seen = new Set();
  const errors = [];
  for (const issue of issues) {
    const field = issue.path.join('.') || 'form';
    if (seen.has(field)) continue; // keep the first message per field
    seen.add(field);
    errors.push({ field, message: issue.message });
  }
  return errors;
}

/**
 * Validates request data with Zod schemas.
 *   validate({ body: schema, query: schema })
 * Parsed (clean, type-converted) values replace req.body; query values are
 * stored on req.validatedQuery because Express 5 makes req.query read-only.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    for (const [part, schema] of Object.entries(schemas)) {
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) throw ApiError.validation(formatZodIssues(result.error.issues));
      if (part === 'query') req.validatedQuery = result.data;
      else req[part] = result.data;
    }
    next();
  };
}
