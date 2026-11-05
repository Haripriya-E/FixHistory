import mongoose from 'mongoose';
import { ASSET_CATEGORIES } from '../utils/constants.js';
import { fileSchema } from './fileSchema.js';

const { ObjectId } = mongoose.Schema.Types;

/** Owner-controlled settings for the public QR passport view. */
const publicPassportSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    token: { type: String, required: true },
    showImage: { type: Boolean, default: true },
    showPurchaseInfo: { type: Boolean, default: false },
    showWarranty: { type: Boolean, default: true },
    showServiceHistory: { type: Boolean, default: true },
    showServiceCosts: { type: Boolean, default: false },
  },
  { _id: false },
);

const assetSchema = new mongoose.Schema(
  {
    // Human-readable unique ID shown in the passport, e.g. FH-7KQ29XMR
    assetId: { type: String, required: true, unique: true, uppercase: true, trim: true },

    // The user who owns the asset now. All access checks use this field.
    currentOwner: { type: ObjectId, ref: 'User', required: true },
    // The user who first registered the asset (does not change on transfer).
    registeredBy: { type: ObjectId, ref: 'User', required: true },

    name: { type: String, required: [true, 'Asset name is required'], trim: true, maxlength: 100 },
    category: { type: String, required: true, enum: ASSET_CATEGORIES },
    brand: { type: String, trim: true, maxlength: 60 },
    model: { type: String, trim: true, maxlength: 60 },
    serialNumber: { type: String, trim: true, maxlength: 80 },
    purchaseDate: { type: Date },
    purchasePrice: { type: Number, min: 0 },
    warrantyStart: { type: Date },
    warrantyExpiry: { type: Date },
    seller: { type: String, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000 },
    image: { type: fileSchema, default: null },

    publicPassport: { type: publicPassportSchema, required: true },

    // true for records created by the demo seed script
    isSample: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

assetSchema.index({ currentOwner: 1, createdAt: -1 });
assetSchema.index({ currentOwner: 1, category: 1 });
assetSchema.index({ currentOwner: 1, warrantyExpiry: 1 });
assetSchema.index({ 'publicPassport.token': 1 }, { unique: true });

export const Asset = mongoose.model('Asset', assetSchema);
