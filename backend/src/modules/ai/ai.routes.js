import { Router } from 'express';
import * as aiController from './ai.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { createRateLimiter } from '../../utils/rateLimiter.js';
import {
  createConversationSchema,
  askAiSchema,
  conversationIdParamSchema
} from './ai.schema.js';

const router = Router();

// All AI endpoints require authentication
router.use(authenticate);

// Rate limiter for AI query endpoint (e.g. 10 requests / minute as specified in Section 59)
const aiRateLimiter = createRateLimiter({
  max: 10,
  windowSeconds: 60,
  keyPrefix: 'user'
});

router.post(
  '/conversations',
  validate(createConversationSchema),
  aiController.createConversation
);

router.get(
  '/conversations',
  aiController.getConversations
);

router.get(
  '/conversations/:conversationId',
  validate({ params: conversationIdParamSchema }),
  aiController.getConversationById
);

router.post(
  '/conversations/:conversationId/messages',
  aiRateLimiter,
  validate({
    params: conversationIdParamSchema,
    body: askAiSchema
  }),
  aiController.askAi
);

export default router;
