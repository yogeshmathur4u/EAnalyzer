import { Router } from 'express';
import { googleAuth, googleCallback, me, logout, deleteAccount } from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/google', googleAuth);
router.get('/callback', googleCallback);
router.get('/me', requireAuth, me);
router.post('/logout', requireAuth, logout);
router.delete('/account', requireAuth, deleteAccount);

export default router;
