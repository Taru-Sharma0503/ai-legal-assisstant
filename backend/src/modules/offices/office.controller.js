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
    const distanceUnavailableCount = offices.distanceUnavailableCount || 0;
    const messages = [];
    if (!city && latitude !== undefined) messages.push('City and state were not resolved; results are coordinate-based and are not city-filtered.');
    if (distanceUnavailableCount > 0) {
      messages.push(radiusKm !== undefined
        ? `${distanceUnavailableCount} matching office${distanceUnavailableCount === 1 ? '' : 's'} have no coordinates, so their distance cannot be calculated. They were excluded from this radius search.`
        : `${distanceUnavailableCount} matching office${distanceUnavailableCount === 1 ? '' : 's'} have no coordinates, so their distance cannot be calculated.`);
    }
    const message = messages.join(' ');
    return sendSuccess(res, 200, offices, message);
  } catch (error) {
    next(error);
  }
};
