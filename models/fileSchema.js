import mongoose from 'mongoose';

/**
 * Metadata for an uploaded file (asset image or invoice).
 * The file itself lives in server/uploads and is only served through
 * authenticated API routes, never as a public static folder.
 */
export const fileSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true }, // random name on disk
    originalName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false },
);

// Hide the internal disk filename from API responses.
fileSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.filename;
    return ret;
  },
});
