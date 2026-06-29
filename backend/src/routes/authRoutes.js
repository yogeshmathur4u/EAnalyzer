import { Router } from 'express';
import { googleAuth, googleCallback, me, logout } from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/google', googleAuth);
router.get('/callback', googleCallback);
router.get('/me', requireAuth, me);
router.get('/logout', logout);

export default router;
