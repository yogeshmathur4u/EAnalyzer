import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  microsoftConnect,
  microsoftCallback,
  microsoftStatus,
  microsoftDisconnect,
} from '../controllers/microsoftAuthController.js';

const router = Router();

router.get('/connect', requireAuth, microsoftConnect);
router.get('/callback', requireAuth, microsoftCallback);
router.get('/status', requireAuth, microsoftStatus);
router.delete('/disconnect', requireAuth, microsoftDisconnect);

export default router;
