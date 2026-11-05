import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { optionalAuth, protect } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import {
  changePasswordSchema,
  loginSchema,
  profileSchema,
  registerSchema,
} from '../validators/authSchemas.js';

const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), auth.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), auth.login);
router.post('/logout', auth.logout);
router.get('/me', protect, auth.me);
router.get('/session', optionalAuth, auth.session);
router.put('/profile', protect, validate({ body: profileSchema }), auth.updateProfile);
router.put('/password', protect, authLimiter, validate({ body: changePasswordSchema }), auth.changePassword);

export default router;
