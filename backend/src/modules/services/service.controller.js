import * as serviceService from './service.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const searchServices = async (req, res, next) => {
  try {
    const { q, department, region, page, limit } = req.query;
    const result = await serviceService.searchServices({
      q,
      department,
      region,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10
    });
    return sendSuccess(res, 200, result);
  } catch (error) {
    next(error);
  }
};

export const getServiceDetails = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const result = await serviceService.getServiceById(serviceId);
    return sendSuccess(res, 200, result);
  } catch (error) {
    next(error);
  }
};

export const getServiceChecklist = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const result = await serviceService.getServiceChecklist(serviceId);
    return sendSuccess(res, 200, result);
  } catch (error) {
    next(error);
  }
};
