import fs from 'node:fs';
import mongoose from 'mongoose';
import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/** 404 for unknown API routes. */
export function notFound(req, _res, next) {
  next(ApiError.notFound(`API route not found: ${req.method} ${req.originalUrl}`));
}

function toApiError(err) {
  if (err instanceof ApiError) return err;

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return ApiError.badRequest(`File is too large. The maximum size is ${env.maxUploadMb} MB.`);
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') return ApiError.badRequest('Unexpected file field in the upload.');
    return ApiError.badRequest(`Upload failed: ${err.message}`);
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return ApiError.validation(errors);
  }

  if (err instanceof mongoose.Error.CastError) return ApiError.badRequest(`Invalid value for ${err.path}.`);

  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
    if (field === 'email') return ApiError.conflict('An account with this email already exists.');
    return ApiError.conflict('This record already exists.');
  }

  if (err?.type === 'entity.parse.failed') return ApiError.badRequest('The request body is not valid JSON.');
  if (err?.type === 'entity.too.large') return ApiError.badRequest('The request is too large.');

  return null;
}

// Express recognises error handlers by their four parameters.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  // Remove a file that was uploaded as part of a request that failed.
  if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});

  const apiError = toApiError(err);
  if (!apiError) {
    console.error(`[error] ${req.method} ${req.originalUrl}\n`, err);
  }

  const status = apiError?.statusCode || 500;
  const body = {
    success: false,
    message: apiError?.message || 'Something went wrong on the server. Please try again.',
  };
  if (apiError?.errors) body.errors = apiError.errors;
  if (!apiError && !env.isProduction) body.detail = err?.message;

  res.status(status).json(body);
}
