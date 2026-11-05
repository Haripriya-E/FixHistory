/**
 * Consistent JSON response helpers.
 * Success: { success: true, message?, data }
 * Error:   { success: false, message, errors? }   (see middleware/errorHandler.js)
 */
export function sendSuccess(res, data = null, { status = 200, message } = {}) {
  const body = { success: true };
  if (message) body.message = message;
  body.data = data;
  return res.status(status).json(body);
}

/** Builds pagination metadata for list endpoints. */
export function buildPagination(page, limit, total) {
  return {
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}
