import mongoose from 'mongoose';
import { SERVICE_TYPES } from '../utils/constants.js';
import { fileSchema } from './fileSchema.js';

const { ObjectId } = mongoose.Schema.Types;

/**
 * One service, repair or inspection event in an asset's history.
 * Records belong to the asset, so they stay with it after an ownership transfer.
 */
const maintenanceRecordSchema = new mongoose.Schema(
  {
    asset: { type: ObjectId, ref: 'Asset', required: true },
    createdBy: { type: ObjectId, ref: 'User', required: true },

    serviceDate: { type: Date, required: [true, 'Service date is required'] },
    serviceType: { type: String, required: true, enum: SERVICE_TYPES },
    problemDescription: { type: String, trim: true, maxlength: 1000 },
    workPerformed: { type: String, required: [true, 'Work performed is required'], trim: true, maxlength: 2000 },
    replacedParts: { type: [{ type: String, trim: true, maxlength: 80 }], default: [] },
    technician: { type: String, trim: true, maxlength: 80 },
    serviceProvider: { type: String, trim: true, maxlength: 100 },
    cost: { type: Number, min: 0, default: 0 },
    nextServiceDate: { type: Date },
    notes: { type: String, trim: true, maxlength: 1000 },
    invoice: { type: fileSchema, default: null },
  },
  { timestamps: true, versionKey: false },
);

maintenanceRecordSchema.index({ asset: 1, serviceDate: -1 });
maintenanceRecordSchema.index({ asset: 1, serviceType: 1 });

export const MaintenanceRecord = mongoose.model('MaintenanceRecord', maintenanceRecordSchema);
