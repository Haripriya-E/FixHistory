import mongoose from 'mongoose';
import { OWNERSHIP_EVENTS } from '../utils/constants.js';

const { ObjectId } = mongoose.Schema.Types;

/**
 * Permanent log of who owned an asset and when.
 * A "Registered" entry is written when the asset is created; a "Transferred"
 * entry is written each time a transfer is confirmed.
 * Owner names are copied so the history stays readable even if an account is removed.
 */
const ownershipHistorySchema = new mongoose.Schema(
  {
    asset: { type: ObjectId, ref: 'Asset', required: true, index: true },
    previousOwner: { type: ObjectId, ref: 'User', default: null },
    previousOwnerName: { type: String, trim: true },
    newOwner: { type: ObjectId, ref: 'User', required: true },
    newOwnerName: { type: String, trim: true },
    transferDate: { type: Date, required: true, default: Date.now },
    transferStatus: { type: String, enum: OWNERSHIP_EVENTS, required: true },
    transferRequest: { type: ObjectId, ref: 'TransferRequest', default: null },
  },
  { timestamps: true, versionKey: false },
);

export const OwnershipHistory = mongoose.model('OwnershipHistory', ownershipHistorySchema);
