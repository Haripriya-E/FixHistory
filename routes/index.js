import { Router } from 'express';
import * as dashboard from '../controllers/dashboardController.js';
import * as publicPassport from '../controllers/publicController.js';
import * as reminders from '../controllers/reminderController.js';
import * as reports from '../controllers/reportController.js';
import * as transfers from '../controllers/transferController.js';
import * as warranty from '../controllers/warrantyController.js';
import { optionalAuth, protect } from '../middleware/auth.js';
import { publicLimiter, transferCodeLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import {
  createTransferSchema,
  reminderListQuerySchema,
  reminderUpdateSchema,
  reportQuerySchema,
  transferCodeSchema,
  warrantyQuerySchema,
} from '../validators/otherSchemas.js';
import assetRoutes from './assetRoutes.js';
import authRoutes from './authRoutes.js';
import maintenanceRoutes from './maintenanceRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/assets', assetRoutes);
router.use('/maintenance', maintenanceRoutes);

// Dashboard
router.get('/dashboard/stats', protect, dashboard.stats);
router.get('/dashboard/charts', protect, dashboard.charts);
router.get('/dashboard/recent-activity', protect, dashboard.recentActivity);

// Warranty
router.get('/warranty', protect, validate({ query: warrantyQuerySchema }), warranty.listWarranties);

// Reminders and notifications
router.get('/reminders', protect, validate({ query: reminderListQuerySchema }), reminders.listReminders);
router.put('/reminders/:id', protect, validate({ body: reminderUpdateSchema }), reminders.updateReminder);

// Ownership transfers
router.get('/transfers', protect, transfers.listTransfers);
router.post('/transfers', protect, validate({ body: createTransferSchema }), transfers.createTransfer);
router.post('/transfers/preview', protect, transferCodeLimiter, validate({ body: transferCodeSchema }), transfers.previewTransfer);
router.post('/transfers/confirm', protect, transferCodeLimiter, validate({ body: transferCodeSchema }), transfers.confirmTransfer);
router.patch('/transfers/:id/cancel', protect, transfers.cancelTransfer);
router.patch('/transfers/:id/reject', protect, transfers.rejectTransfer);

// Public QR passport (no login required; owner-controlled fields only)
router.get('/public/passport/:token', publicLimiter, optionalAuth, publicPassport.getPublicPassport);
router.get('/public/passport/:token/image', publicLimiter, publicPassport.getPublicPassportImage);

// Reports
router.get('/reports/summary', protect, reports.summary);
router.get('/reports/pdf', protect, validate({ query: reportQuerySchema }), reports.pdf);

export default router;
