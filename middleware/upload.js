import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { DOCUMENT_MIME_TYPES, IMAGE_MIME_TYPES, MIME_EXTENSIONS } from '../utils/constants.js';

export const UPLOAD_FOLDERS = {
  assets: path.join(env.uploadDir, 'assets'),
  invoices: path.join(env.uploadDir, 'invoices'),
};

export function ensureUploadFolders() {
  for (const dir of Object.values(UPLOAD_FOLDERS)) fs.mkdirSync(dir, { recursive: true });
}

/** First bytes ("magic numbers") of each allowed file type. */
function matchesSignature(buffer, mimeType) {
  const hex = buffer.toString('hex');
  switch (mimeType) {
    case 'image/jpeg':
      return hex.startsWith('ffd8ff');
    case 'image/png':
      return hex.startsWith('89504e470d0a1a0a');
    case 'image/webp':
      return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'application/pdf':
      return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    default:
      return false;
  }
}

/**
 * Checks that the uploaded file's content really matches its declared type,
 * so a renamed script or HTML file cannot be stored as an "image".
 */
async function verifyFileContent(req, _res, next) {
  if (!req.file) return next();
  const handle = await fs.promises.open(req.file.path, 'r');
  const buffer = Buffer.alloc(16);
  try {
    await handle.read(buffer, 0, 16, 0);
  } finally {
    await handle.close();
  }
  if (!matchesSignature(buffer, req.file.mimetype)) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    req.file = undefined;
    throw ApiError.badRequest('The uploaded file is damaged or is not the type it claims to be.');
  }
  next();
}

function createUploader({ folder, field, allowedTypes, typeMessage }) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, folder),
    // Random file names: the user's original name is never used on disk.
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${MIME_EXTENSIONS[file.mimetype]}`),
  });

  const upload = multer({
    storage,
    limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1, fields: 40 },
    fileFilter: (_req, file, cb) => {
      if (allowedTypes.includes(file.mimetype)) return cb(null, true);
      return cb(ApiError.badRequest(typeMessage));
    },
  });

  return [upload.single(field), verifyFileContent];
}

export const uploadAssetImage = createUploader({
  folder: UPLOAD_FOLDERS.assets,
  field: 'image',
  allowedTypes: IMAGE_MIME_TYPES,
  typeMessage: 'Asset image must be a JPG, PNG or WEBP file.',
});

export const uploadInvoice = createUploader({
  folder: UPLOAD_FOLDERS.invoices,
  field: 'invoice',
  allowedTypes: DOCUMENT_MIME_TYPES,
  typeMessage: 'Invoice must be a PDF, JPG, PNG or WEBP file.',
});

/** Converts a multer file object into the metadata stored in MongoDB. */
export function toFileMeta(file) {
  if (!file) return null;
  return {
    filename: file.filename,
    originalName: path.basename(file.originalname).slice(0, 255),
    mimeType: file.mimetype,
    size: file.size,
  };
}

export function resolveUploadPath(kind, filename) {
  // basename() prevents any attempt to escape the upload folder.
  return path.join(UPLOAD_FOLDERS[kind], path.basename(filename));
}

export async function deleteUploadedFile(kind, fileMeta) {
  if (!fileMeta?.filename) return;
  await fs.promises.unlink(resolveUploadPath(kind, fileMeta.filename)).catch(() => {});
}

/** Streams a stored file to the browser after the caller has checked permissions. */
export function sendStoredFile(res, kind, fileMeta, { download = false } = {}) {
  const filePath = resolveUploadPath(kind, fileMeta.filename);
  if (!fs.existsSync(filePath)) throw ApiError.notFound('The file is no longer available on the server.');
  const asciiName = fileMeta.originalName.replace(/[^\w.\- ]/g, '_');
  const disposition = download ? 'attachment' : 'inline';
  res.setHeader('Content-Type', fileMeta.mimeType);
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileMeta.originalName)}`,
  );
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.sendFile(filePath);
}
