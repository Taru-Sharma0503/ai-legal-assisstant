import {
  askSchema,
  createConversationSchema,
  conversationIdParamSchema,
  postMessageSchema
} from "./ai.schema.js";
import {
  askService,
  createConversationService,
  listConversationsService,
  getConversationDetailsService,
  postMessageService
} from "./ai.service.js";
import { sendSuccess } from "../../utils/apiResponse.js";

export async function askHandler(req, res, next) {
  try {
    const validated = askSchema.parse(req.body);
    const result = await askService(validated);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          details: err.errors
        }
      });
    }
    next(err);
  }
}

export async function healthHandler(req, res) {
  return res.status(200).json({ status: "ok" });
}

export async function createConversationHandler(req, res, next) {
  try {
    const validated = createConversationSchema.parse(req.body || {});
    const result = await createConversationService(req.user.id, validated);
    return sendSuccess(res, 201, result);
  } catch (err) {
    next(err);
  }
}

export async function listConversationsHandler(req, res, next) {
  try {
    const result = await listConversationsService(req.user.id);
    return sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
}

export async function getConversationHandler(req, res, next) {
  try {
    const { conversationId } = conversationIdParamSchema.parse(req.params);
    const result = await getConversationDetailsService(req.user.id, conversationId);
    return sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
}

export async function postMessageHandler(req, res, next) {
  try {
    const { conversationId } = conversationIdParamSchema.parse(req.params);
    const validated = postMessageSchema.parse(req.body);
    const result = await postMessageService(req.user.id, conversationId, validated);
    return sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
}

