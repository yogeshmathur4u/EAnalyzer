import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  getMetadata,
  syncFromOutlook,
  syncSelected,
  refreshAuthorized,
  submitConsent,
} from '../controllers/outlookController.js';

const router = Router();

router.get('/metadata', requireAuth, getMetadata);
router.post('/sync', requireAuth, syncFromOutlook);
router.post('/sync/selected', requireAuth, syncSelected);
router.post('/threads/refresh-authorized', requireAuth, refreshAuthorized);
router.post('/threads/consent', requireAuth, submitConsent);

export default router;
