import * as dashboardService from './dashboard.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const getDashboard = async (req, res, next) => {
  try {
    const data = await dashboardService.getDashboardData(req.user.id, req.user.name);
    return sendSuccess(res, 200, data);
  } catch (error) {
    next(error);
  }
};
