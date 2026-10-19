import { prisma, isDbConnected } from '../../config/db.js';
import { logger } from '../../utils/logger.js';
import { OFFICE_RECORDS } from '../../utils/officeSeed.js';

export const INITIAL_OFFICES = OFFICE_RECORDS;

const supportsService = (office, serviceId) =>
  office.serviceIds?.includes(serviceId) || office.services?.some((service) => service.serviceId === serviceId);

const normalizeText = (value) => typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';

const matchesTextFilter = (value, filter) =>
  !filter || normalizeText(value) === normalizeText(filter);

const matchesFallbackFilters = (office, { city, state, serviceId }) =>
  matchesTextFilter(office.city, city) &&
  matchesTextFilter(office.state, state) &&
  (!serviceId || supportsService(office, serviceId));

const sameDirectoryOffice = (databaseOffice, curatedOffice) => {
  if (databaseOffice.seedKey && curatedOffice.seedKey) return databaseOffice.seedKey === curatedOffice.seedKey;
  const normalize = (value) => value?.trim().toLocaleLowerCase() || '';
  return normalize(databaseOffice.name) === normalize(curatedOffice.name) &&
    normalize(databaseOffice.city) === normalize(curatedOffice.city) &&
    normalize(databaseOffice.state) === normalize(curatedOffice.state);
};

const sameDatabaseOffice = (first, second) => {
  if (first.seedKey && second.seedKey) return first.seedKey === second.seedKey;
  if (first.id && second.id && first.id === second.id) return true;
  const normalize = (value) => value?.trim().toLocaleLowerCase() || '';
  return Boolean(first.address && second.address) &&
    normalize(first.name) === normalize(second.name) &&
    normalize(first.city) === normalize(second.city) &&
    normalize(first.state) === normalize(second.state) &&
    normalize(first.address) === normalize(second.address);
};

const enrichMissingCoordinates = (databaseOffices, curatedOffices) => {
  return databaseOffices.map((office) => {
    const curated = curatedOffices.find((candidate) => sameDirectoryOffice(office, candidate));
    if (!curated) return office;
    const databaseHasCoordinates = isValidCoordinate(office.latitude, office.longitude);
    if (databaseHasCoordinates || !isValidCoordinate(curated.latitude, curated.longitude)) return office;
    return {
      ...office,
      latitude: curated.latitude,
      longitude: curated.longitude,
      coordinateSource: curated.coordinateSource,
      coordinateSourceUrl: curated.coordinateSourceUrl,
      coordinateApproximate: curated.coordinateApproximate === true
    };
  });
};

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
  const cityFilter = typeof city === 'string' ? city.trim() || undefined : city;
  const stateFilter = typeof state === 'string' ? state.trim() || undefined : state;
  const hasLatitude = latitude !== undefined;
  const hasLongitude = longitude !== undefined;
  const hasOriginInput = hasLatitude || hasLongitude;
  const hasValidOrigin = isValidCoordinate(latitude, longitude);
  if (hasOriginInput && !hasValidOrigin) {
    throw new Error('Latitude and longitude must be a valid coordinate pair');
  }
  if (radiusKm !== undefined && (!Number.isFinite(radiusKm) || radiusKm <= 0)) {
    throw new Error('Radius must be a finite positive number');
  }
  if (radiusKm !== undefined && !hasValidOrigin) {
    throw new Error('Radius search requires valid latitude and longitude');
  }
  let offices;
  const connected = typeof dbConnected === 'function' ? dbConnected() : dbConnected;
  if (db && connected) {
    try {
      const where = {
        ...(cityFilter ? { city: { equals: cityFilter, mode: 'insensitive' } } : {}),
        ...(stateFilter ? { state: { equals: stateFilter, mode: 'insensitive' } } : {}),
        ...(serviceId ? { services: { some: { serviceId } } } : {})
      };
      // An empty result may mean this database has not received the curated office catalogue.
      offices = await db.office.findMany({
        where,
        include: { services: { include: { service: true } } }
      });
      offices = offices.filter((office, index) =>
        offices.findIndex((candidate) => sameDatabaseOffice(candidate, office)) === index);
      const localMatches = fallbackOffices.filter((office) => matchesFallbackFilters(office, { city: cityFilter, state: stateFilter, serviceId }));
      const databaseHasExpectedRecords = offices.length === localMatches.length &&
        localMatches.every((curated) => offices.some((office) => sameDirectoryOffice(office, curated)));
      if (environment !== 'production' && localMatches.length > 0 && !databaseHasExpectedRecords) {
        log.warn('[Offices] Database directory is incomplete; serving the matching curated records');
        offices = localMatches;
      } else if (offices.length > 0) {
        offices = enrichMissingCoordinates(offices, localMatches);
      }
    } catch (error) {
      log.error('[Offices] Database search failed:', error);
      if (environment === 'production') throw error;
      offices = fallbackOffices.filter((office) => matchesFallbackFilters(office, { city: cityFilter, state: stateFilter, serviceId }));
    }
  } else {
    if (environment === 'production') {
      const error = new Error('Office database is unavailable');
      log.error('[Offices] Database search unavailable:', error);
      throw error;
    }
    offices = fallbackOffices.filter((office) => matchesFallbackFilters(office, { city: cityFilter, state: stateFilter, serviceId }));
  }

  const hasOrigin = hasValidOrigin;
  const results = offices.map((office) => {
    const distance = hasOrigin
      ? calculateHaversineDistance(latitude, longitude, office.latitude, office.longitude)
      : null;
    return {
      id: office.id || office.seedKey,
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
      coordinateSourceUrl: office.coordinateSourceUrl || null,
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
  if (radiusKm === undefined) {
    Object.defineProperty(ordered, 'distanceUnavailableCount', { value: withoutDistance.length });
    return ordered;
  }
  const withinRadius = ordered.filter((office) => typeof office.distanceKm === 'number' && office.distanceKm <= radiusKm);
  Object.defineProperty(withinRadius, 'distanceUnavailableCount', { value: withoutDistance.length });
  return withinRadius;
};

export const searchOffices = createOfficeSearch();
