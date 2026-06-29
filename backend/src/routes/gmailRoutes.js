import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  getMetadata,
  getThread,
  getThreads,
  syncFromGmail,
  syncSelected,
  refreshAuthorized,
  submitConsent,
  getExtracted,
} from '../controllers/gmailController.js';

const router = Router();

router.get('/metadata', requireAuth, getMetadata);
router.get('/threads', requireAuth, getThreads);
router.post('/sync', requireAuth, syncFromGmail);
router.post('/sync/selected', requireAuth, syncSelected);
router.post('/threads/refresh-authorized', requireAuth, refreshAuthorized);
router.post('/threads/consent', requireAuth, submitConsent);
router.get('/threads/:threadId/extracted', requireAuth, getExtracted);
router.get('/threads/:threadId', requireAuth, getThread);

export default router;
