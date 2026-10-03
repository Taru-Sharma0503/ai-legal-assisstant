import * as adminService from './admin.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const getEscalationQueue = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await adminService.getEscalationQueue({
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10
    });
    return sendSuccess(res, 200, result);
  } catch (error) {
    next(error);
  }
};

export const getCaseDetails = async (req, res, next) => {
  try {
    const { caseId } = req.params;
    const result = await adminService.getAdminCaseById(caseId);
    return sendSuccess(res, 200, result);
  } catch (error) {
    next(error);
  }
};

export const updateCaseStatus = async (req, res, next) => {
  try {
    const { caseId } = req.params;
    const { status } = req.body;
    const result = await adminService.updateCaseStatus(caseId, status);
    return sendSuccess(res, 200, result);
  } catch (error) {
    next(error);
  }
};

export const replyToCase = async (req, res, next) => {
  try {
    const { caseId } = req.params;
    const { message } = req.body;
    const result = await adminService.adminReply(req.user.id, caseId, { message });
    return sendSuccess(res, 200, result);
  } catch (error) {
    next(error);
  }
};

export const createService = async (req, res, next) => {
  try {
    const result = await adminService.createService(req.body);
    return sendSuccess(res, 201, result, 'Service created successfully');
  } catch (error) {
    next(error);
  }
};

export const updateService = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const result = await adminService.updateService(serviceId, req.body);
    return sendSuccess(res, 200, result, 'Service updated successfully');
  } catch (error) {
    next(error);
  }
};

export const deactivateService = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const result = await adminService.deactivateService(serviceId);
    return sendSuccess(res, 200, null, result.message);
  } catch (error) {
    next(error);
  }
};
