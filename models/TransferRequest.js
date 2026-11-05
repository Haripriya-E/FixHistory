import mongoose from 'mongoose';
import { TRANSFER_STATUSES } from '../utils/constants.js';

const { ObjectId } = mongoose.Schema.Types;

/**
 * A pending or finished ownership transfer.
 * Only an HMAC of the transfer code is stored (see utils/codes.js).
 */
const transferRequestSchema = new mongoose.Schema(
  {
    asset: { type: ObjectId, ref: 'Asset', required: true },
    currentOwner: { type: ObjectId, ref: 'User', required: true, index: true },
    newOwnerEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    newOwner: { type: ObjectId, ref: 'User', default: null },
    codeHash: { type: String, required: true, index: true },
    message: { type: String, trim: true, maxlength: 300 },
    status: { type: String, enum: TRANSFER_STATUSES, default: 'Pending' },
    expiresAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// Only one pending transfer may exist for an asset at any time.
transferRequestSchema.index(
  { asset: 1 },
  { unique: true, partialFilterExpression: { status: 'Pending' }, name: 'one_pending_transfer_per_asset' },
);

transferRequestSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.codeHash;
    return ret;
  },
});

export const TransferRequest = mongoose.model('TransferRequest', transferRequestSchema);
