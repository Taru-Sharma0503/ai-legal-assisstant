import * as officeService from './office.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const getOffices = async (req, res, next) => {
  try {
    const { serviceId, city, state, latitude, longitude, radiusKm } = req.query;
    const offices = await officeService.searchOffices({
      serviceId,
      city,
      state,
      latitude: latitude !== undefined ? parseFloat(latitude) : undefined,
      longitude: longitude !== undefined ? parseFloat(longitude) : undefined,
      radiusKm: radiusKm !== undefined ? parseFloat(radiusKm) : undefined
    });
    return sendSuccess(res, 200, offices);
  } catch (error) {
    next(error);
  }
};
