import * as applicationService from './application.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiError.js';
import { getFileUrl } from '../../utils/upload.js';
import fs from 'fs';

export const createApplication = async (req, res, next) => {
  try {
    const { serviceId } = req.body;
    const result = await applicationService.createApplication(req.user.id, { serviceId });
    return sendSuccess(res, 201, result);
  } catch (error) {
    next(error);
  }
};

export const getMyApplications = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await applicationService.getMyApplications(req.user.id, {
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10
    });
    return sendSuccess(res, 200, result);
  } catch (error) {
    next(error);
  }
};

export const getApplicationDetails = async (req, res, next) => {
  try {
    const { applicationId } = req.params;
    const result = await applicationService.getApplicationById(req.user.id, applicationId);
    return sendSuccess(res, 200, result);
  } catch (error) {
    next(error);
  }
};

export const uploadDocument = async (req, res, next) => {
  try {
    const { applicationId } = req.params;
    const { documentName } = req.body;

    if (!req.file) {
      throw ApiError.badRequest('File binary is required');
    }

    if (!documentName || !documentName.trim()) {
      throw ApiError.badRequest('documentName form field is required');
    }

    const fileUrl = getFileUrl(req, req.file.filename);
    const result = await applicationService.uploadDocument(req.user.id, applicationId, {
      documentName: documentName.trim(),
      fileUrl
    });

    return sendSuccess(res, 200, result);
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(error);
  }
};
