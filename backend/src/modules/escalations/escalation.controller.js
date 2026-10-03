import * as escalationService from './escalation.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const createEscalation = async (req, res, next) => {
  try {
    const { conversationId, subject, description } = req.body;
    const result = await escalationService.createEscalation(req.user.id, {
      conversationId,
      subject,
      description
    });
    return sendSuccess(res, 201, result);
  } catch (error) {
    next(error);
  }
};

export const getMyCases = async (req, res, next) => {
  try {
    const result = await escalationService.getMyCases(req.user.id);
    return sendSuccess(res, 200, result);
  } catch (error) {
    next(error);
  }
};

export const getCaseDetails = async (req, res, next) => {
  try {
    const { caseId } = req.params;
    const result = await escalationService.getCaseById(req.user.id, caseId, req.user.role);
    return sendSuccess(res, 200, result);
  } catch (error) {
    next(error);
  }
};

export const sendCaseMessage = async (req, res, next) => {
  try {
    const { caseId } = req.params;
    const { message } = req.body;
    const result = await escalationService.sendCaseMessage(req.user.id, caseId, req.user.role, { message });
    return sendSuccess(res, 200, result);
  } catch (error) {
    next(error);
  }
};
