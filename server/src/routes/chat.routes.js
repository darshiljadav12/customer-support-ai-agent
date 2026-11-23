import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import {
  sendMessage,
  streamMessage,
  listConversations,
  getConversation,
  deleteConversation,
  sendSchema,
} from '../controllers/chat.controller.js';

const router = Router();

// Every chat route requires a logged-in user.
router.use(requireAuth);

router.post('/send', chatLimiter, validate(sendSchema), sendMessage); // full JSON reply
router.post('/send/stream', chatLimiter, validate(sendSchema), streamMessage); // SSE, token by token
router.get('/history', listConversations);
router.get('/history/:id', getConversation);
router.delete('/history/:id', deleteConversation);

export default router;
