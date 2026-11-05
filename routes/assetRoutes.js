import { Router } from 'express';
import * as assets from '../controllers/assetController.js';
import { protect } from '../middleware/auth.js';
import { uploadAssetImage } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { assetBodySchema, assetListQuerySchema, sharingSchema } from '../validators/assetSchemas.js';

const router = Router();

router.use(protect); // every asset route requires login

router.get('/', validate({ query: assetListQuerySchema }), assets.listAssets);
router.get('/options', assets.listAssetOptions);
router.post('/', uploadAssetImage, validate({ body: assetBodySchema }), assets.createAsset);

router.get('/:id', assets.getAsset);
router.put('/:id', uploadAssetImage, validate({ body: assetBodySchema }), assets.updateAsset);
router.delete('/:id', assets.deleteAsset);

router.get('/:id/image', assets.getAssetImage);
router.get('/:id/qr', assets.getAssetQr);
router.put('/:id/sharing', validate({ body: sharingSchema }), assets.updateSharing);
router.post('/:id/sharing/regenerate', assets.regeneratePublicLink);

export default router;
