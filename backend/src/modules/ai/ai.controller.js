import * as aiService from './ai.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const createConversation = async (req, res, next) => {
  try {
    const { language, title } = req.body;
    const result = await aiService.createConversation(req.user.id, { language, title });
    return sendSuccess(res, 201, result);
  } catch (error) {
    next(error);
  }
};

export const getConversations = async (req, res, next) => {
  try {
    const result = await aiService.getConversations(req.user.id);
    return sendSuccess(res, 200, result);
  } catch (error) {
    next(error);
  }
};

export const getConversationById = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const result = await aiService.getConversationById(req.user.id, conversationId);
    return sendSuccess(res, 200, result);
  } catch (error) {
    next(error);
  }
};

export const askAi = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { message, language } = req.body;
    const result = await aiService.askAi(req.user.id, conversationId, { message, language });
    return sendSuccess(res, 200, result);
  } catch (error) {
    next(error);
  }
};
