import { Router } from 'express';
import * as maintenance from '../controllers/maintenanceController.js';
import { protect } from '../middleware/auth.js';
import { uploadInvoice } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { maintenanceBodySchema, maintenanceListQuerySchema } from '../validators/maintenanceSchemas.js';

const router = Router();

router.use(protect);

router.get('/', validate({ query: maintenanceListQuerySchema }), maintenance.listRecords);
router.post('/', uploadInvoice, validate({ body: maintenanceBodySchema }), maintenance.createRecord);
router.get('/:id', maintenance.getRecord);
router.put('/:id', uploadInvoice, validate({ body: maintenanceBodySchema }), maintenance.updateRecord);
router.delete('/:id', maintenance.deleteRecord);
router.get('/:id/invoice', maintenance.getInvoice);

export default router;
