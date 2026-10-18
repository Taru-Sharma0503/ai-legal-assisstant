import { prisma, isDbConnected } from '../../config/db.js';
import { logger } from '../../utils/logger.js';
import { OFFICE_RECORDS } from '../../utils/officeSeed.js';

export const INITIAL_OFFICES = OFFICE_RECORDS;

const supportsService = (office, serviceId) =>
  office.serviceIds?.includes(serviceId) || office.services?.some((service) => service.serviceId === serviceId);

const matchesTextFilter = (value, filter) =>
  !filter || value?.toLocaleLowerCase().includes(filter.toLocaleLowerCase());

const matchesFallbackFilters = (office, { city, state, serviceId }) =>
  matchesTextFilter(office.city, city) &&
  matchesTextFilter(office.state, state) &&
  (!serviceId || supportsService(office, serviceId));

const isValidCoordinate = (latitude, longitude) =>
  Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
  Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;

export const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) return null;

  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) ** 2;
  // Floating point rounding can put a just-out-of-range value into sqrt(1 - a).
  const clampedA = Math.min(1, Math.max(0, a));
  return R * 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));
};

export const createOfficeSearch = ({
  db = prisma,
  dbConnected = () => isDbConnected,
  fallbackOffices = INITIAL_OFFICES,
  environment = process.env.NODE_ENV,
  log = logger
} = {}) => async ({ serviceId, city, state, latitude, longitude, radiusKm }) => {
  let offices;
  const connected = typeof dbConnected === 'function' ? dbConnected() : dbConnected;
  if (db && connected) {
    try {
      const where = {
        ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
        ...(state ? { state: { contains: state, mode: 'insensitive' } } : {}),
        ...(serviceId ? { services: { some: { serviceId } } } : {})
      };
      // An empty result may mean this database has not received the curated office catalogue.
      offices = await db.office.findMany({
        where,
        include: { services: { include: { service: true } } }
      });
      if (offices.length === 0 && environment !== 'production') {
        const localMatches = fallbackOffices.filter((office) => matchesFallbackFilters(office, { city, state, serviceId }));
        if (localMatches.length > 0) {
          log.warn('[Offices] No database matches; serving curated local office records in non-production');
          offices = localMatches;
        }
      }
    } catch (error) {
      log.error('[Offices] Database search failed:', error);
      if (environment === 'production') throw error;
      offices = fallbackOffices.filter((office) => matchesFallbackFilters(office, { city, state, serviceId }));
    }
  } else {
    if (environment === 'production') {
      const error = new Error('Office database is unavailable');
      log.error('[Offices] Database search unavailable:', error);
      throw error;
    }
    offices = fallbackOffices.filter((office) => matchesFallbackFilters(office, { city, state, serviceId }));
  }

  const hasOrigin = isValidCoordinate(latitude, longitude);
  const results = offices.map((office) => {
    const distance = hasOrigin
      ? calculateHaversineDistance(latitude, longitude, office.latitude, office.longitude)
      : null;
    return {
      id: office.id,
      name: office.name,
      address: office.address,
      city: office.city,
      state: office.state,
      pincode: office.pincode,
      latitude: Number.isFinite(office.latitude) ? office.latitude : null,
      longitude: Number.isFinite(office.longitude) ? office.longitude : null,
      phone: office.phone || '',
      workingHours: office.workingHours || null,
      sourceName: office.sourceName || null,
      sourceUrl: office.sourceUrl || null,
      verifiedAt: office.verifiedAt instanceof Date ? office.verifiedAt.toISOString() : office.verifiedAt || null,
      coordinateSource: office.coordinateSource || null,
      coordinateApproximate: office.coordinateApproximate === true,
      services: (office.services || []).map((link) => ({
        id: link.service?.id || link.serviceId,
        name: link.service?.name || link.serviceName || null,
        sourceName: link.sourceName || null,
        sourceUrl: link.sourceUrl || null,
        verifiedAt: link.verifiedAt instanceof Date ? link.verifiedAt.toISOString() : link.verifiedAt || null,
        // The current DB schema has no link-level status column. Unknown is safer than
        // presenting legacy database links as officially verified.
        verificationStatus: link.verificationStatus || 'unknown'
      })),
      ...(distance !== null ? { distanceKm: Number(distance.toFixed(1)) } : {})
    };
  });

  if (!hasOrigin) return results;

  const withDistance = results.filter((office) => typeof office.distanceKm === 'number');
  const withoutDistance = results.filter((office) => typeof office.distanceKm !== 'number');
  withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
  const ordered = [...withDistance, ...withoutDistance];
  return radiusKm === undefined
    ? ordered
    : ordered.filter((office) => typeof office.distanceKm === 'number' && office.distanceKm <= radiusKm);
};

export const searchOffices = createOfficeSearch();
