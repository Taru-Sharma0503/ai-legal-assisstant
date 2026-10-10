import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { createRateLimiter } from "../../utils/rateLimiter.js";
import {
  askHandler,
  healthHandler,
  createConversationHandler,
  listConversationsHandler,
  getConversationHandler,
  postMessageHandler
} from "./ai.controller.js";

const router = Router();

const askRateLimiter = createRateLimiter({ keyPrefix: 'ai_ask_ip' });
const messageRateLimiter = createRateLimiter({ keyPrefix: 'ai_msg' });

router.get("/health", healthHandler);
router.post("/ask", askRateLimiter, askHandler);

router.post("/conversations", authenticate, createConversationHandler);
router.get("/conversations", authenticate, listConversationsHandler);
router.get("/conversations/:conversationId", authenticate, getConversationHandler);
router.post("/conversations/:conversationId/messages", authenticate, messageRateLimiter, postMessageHandler);

export default router;

