import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { askQuestion, generateStory } from '../controllers/aiController.js';

const router = Router();

router.post('/ask', requireAuth, askQuestion);
router.post('/threads/:threadId/story', requireAuth, generateStory);

export default router;
