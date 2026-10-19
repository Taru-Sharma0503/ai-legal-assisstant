import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

const officeDataPath = fileURLToPath(new URL('../../data/offices/offices.json', import.meta.url));
export const OFFICE_RECORDS = JSON.parse(readFileSync(officeDataPath, 'utf8'));

const isOfficialHttpsUrl = (value) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && ['.gov.in', '.nic.in', '.gov'].some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
};

const officeIdentity = ({ name, address, city, state }) => {
  if (![name, city, state].every((value) => typeof value === 'string')) return null;
  return JSON.stringify([
  name.trim().toLocaleLowerCase(), address?.trim().toLocaleLowerCase() ?? null,
  city.trim().toLocaleLowerCase(), state.trim().toLocaleLowerCase()
  ]);
};

const findExistingOffice = async (db, office) => {
  const byKey = await db.office.findUnique({ where: { seedKey: office.seedKey }, select: { id: true, seedKey: true } });
  if (byKey) return byKey;
  const candidates = await db.office.findMany({
    where: {
      city: { equals: office.city, mode: 'insensitive' },
      state: { equals: office.state, mode: 'insensitive' }
    },
    select: { id: true, seedKey: true, name: true, address: true, city: true, state: true }
  });
  const identity = officeIdentity(office);
  const matches = candidates.filter((candidate) => officeIdentity(candidate) === identity);
  if (matches.length > 1) throw new Error(`Multiple existing offices match ${office.seedKey}; resolve duplicates before seeding`);
  return matches[0] ?? null;
};

export const validateOfficeRecords = (records, allowedServiceIds = []) => {
  const errors = [];
  const serviceIdSet = new Set(allowedServiceIds);
  const keys = new Set();

  if (!Array.isArray(records)) return ['Office data must be an array'];
  records.forEach((office, index) => {
    const prefix = `offices[${index}]`;
    for (const field of ['seedKey', 'name', 'city', 'state', 'sourceName']) {
      if (typeof office?.[field] !== 'string' || !office[field].trim()) {
        errors.push(`${prefix}.${field} is required`);
      }
    }
    if (office?.address !== null && office?.address !== undefined &&
      (typeof office.address !== 'string' || !office.address.trim())) {
      errors.push(`${prefix}.address must be a non-empty string or null`);
    }
    if (office?.seedKey) {
      if (keys.has(office.seedKey)) errors.push(`${prefix}.seedKey is duplicated: ${office.seedKey}`);
      keys.add(office.seedKey);
    }
    if (office?.pincode !== null && office?.pincode !== undefined && !/^\d{6}$/.test(office.pincode)) {
      errors.push(`${prefix}.pincode must be a six digit PIN code or null`);
    }
    if ((office?.latitude == null) !== (office?.longitude == null)) {
      errors.push(`${prefix} must provide both coordinates or neither`);
    }
    if (office?.latitude != null && (
      !Number.isFinite(office.latitude) || office.latitude < -90 || office.latitude > 90 ||
      !Number.isFinite(office.longitude) || office.longitude < -180 || office.longitude > 180
    )) errors.push(`${prefix} coordinates are outside valid bounds`);
    if (office?.latitude != null) {
      if (!office.coordinateSource || typeof office.coordinateSource !== 'string') {
        errors.push(`${prefix}.coordinateSource is required when coordinates are present`);
      }
      if (office.coordinateSource === 'OpenStreetMap Nominatim' && (!/^https:\/\/nominatim\.openstreetmap\.org\//.test(office.coordinateSourceUrl || '') || office.coordinateApproximate !== true)) {
        errors.push(`${prefix} Nominatim coordinates must identify the result URL and be marked approximate`);
      } else if (office.coordinateSourceUrl && !isOfficialHttpsUrl(office.coordinateSourceUrl)) {
        errors.push(`${prefix}.coordinateSourceUrl must use an official government HTTPS domain`);
      }
    }
    if (office?.latitude == null && office?.coordinateApproximate === true) {
      errors.push(`${prefix}.coordinateApproximate cannot be true without coordinates`);
    }
    if (!isOfficialHttpsUrl(office?.sourceUrl)) errors.push(`${prefix}.sourceUrl must use an official government HTTPS domain`);
    if (typeof office?.verifiedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(office.verifiedAt) || !Number.isFinite(Date.parse(office.verifiedAt))) {
      errors.push(`${prefix}.verifiedAt must be a valid date`);
    }
    if (!Array.isArray(office?.services)) {
      errors.push(`${prefix}.services must be an array`);
    } else {
      const linkedIds = new Set();
      office.services.forEach((service, serviceIndex) => {
        const servicePrefix = `${prefix}.services[${serviceIndex}]`;
        if (!serviceIdSet.has(service?.serviceId)) errors.push(`${servicePrefix}.serviceId is not in the service catalogue`);
        if (linkedIds.has(service?.serviceId)) errors.push(`${servicePrefix}.serviceId is duplicated`);
        linkedIds.add(service?.serviceId);
        if (typeof service?.sourceName !== 'string' || !service.sourceName.trim()) errors.push(`${servicePrefix}.sourceName is required`);
        if (!isOfficialHttpsUrl(service?.sourceUrl)) errors.push(`${servicePrefix}.sourceUrl must use an official government HTTPS domain`);
        if (typeof service?.verifiedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(service.verifiedAt) || !Number.isFinite(Date.parse(service.verifiedAt))) errors.push(`${servicePrefix}.verifiedAt must be a valid date`);
      });
    }
  });
  return errors;
};

export const assertNonProductionDatabase = ({ databaseUrl, environment = process.env.NODE_ENV } = {}) => {
  if (environment === 'production') throw new Error('Office seeding is disabled when NODE_ENV=production');
  if (!databaseUrl) throw new Error('DATABASE_URL is required to seed offices');
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid URL; office seeding was blocked');
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const databaseName = parsed.pathname.toLowerCase();
  const targetMarkers = `${databaseName} ${parsed.username} ${parsed.search}`.toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host) || /prod(?:uction)?/.test(targetMarkers)) {
    throw new Error('Office seeding is limited to a local non-production database');
  }
};

export const buildOfficeSeedPlan = (records, existingOffices = [], existingLinks = []) => {
  const officesByKey = new Map(existingOffices.map((office) => [office.seedKey, office]));
  const officesByIdentity = new Map(existingOffices.map((office) => [officeIdentity(office), office]).filter(([identity]) => identity));
  const existingLinkSet = new Set(existingLinks.map(({ officeId, serviceId }) => `${officeId}:${serviceId}`));
  return records.map((office) => {
    const current = officesByKey.get(office.seedKey) ?? officesByIdentity.get(officeIdentity(office));
    const officeId = current?.id ?? office.seedKey;
    return {
      seedKey: office.seedKey,
      action: current ? 'preserve existing office' : 'create office',
      officeId,
      services: office.services.map((service) => ({
        serviceId: service.serviceId,
        action: current && existingLinkSet.has(`${officeId}:${service.serviceId}`)
          ? 'preserve existing relationship'
          : 'create relationship'
      }))
    };
  });
};

const officeFields = (office) => ({
  seedKey: office.seedKey,
  name: office.name,
  address: office.address,
  city: office.city,
  state: office.state,
  pincode: office.pincode ?? null,
  latitude: office.latitude ?? null,
  longitude: office.longitude ?? null,
  phone: office.phone ?? null,
  workingHours: office.workingHours ?? null,
  sourceName: office.sourceName,
  sourceUrl: office.sourceUrl,
  verifiedAt: new Date(office.verifiedAt),
  coordinateSource: office.coordinateSource ?? null,
  coordinateSourceUrl: office.coordinateSourceUrl ?? null,
  coordinateApproximate: office.coordinateApproximate === true
});

export const seedOfficeRecords = async ({
  db,
  records = OFFICE_RECORDS,
  allowedServiceIds = [],
  dryRun = false,
  databaseUrl = process.env.DATABASE_URL,
  environment = process.env.NODE_ENV,
  log = logger
} = {}) => {
  if (!db) throw new Error('A Prisma client is required to seed offices');
  assertNonProductionDatabase({ databaseUrl, environment });
  const errors = validateOfficeRecords(records, allowedServiceIds);
  if (errors.length) throw new Error(`Invalid office data:\n- ${errors.join('\n- ')}`);

  const seedKeys = records.map(({ seedKey }) => seedKey);
  const keyedOffices = await db.office.findMany({ where: { seedKey: { in: seedKeys } }, select: { id: true, seedKey: true, name: true, address: true, city: true, state: true } });
  const existingOffices = [...keyedOffices];
  for (const office of records) {
    if (!keyedOffices.some((existing) => existing.seedKey === office.seedKey)) {
      const legacy = await findExistingOffice(db, office);
      if (legacy && !existingOffices.some(({ id }) => id === legacy.id)) existingOffices.push({ ...legacy, ...office, seedKey: null });
    }
  }
  const existingIds = existingOffices.map(({ id }) => id);
  const existingLinks = existingIds.length
    ? await db.officeService.findMany({ where: { officeId: { in: existingIds } }, select: { officeId: true, serviceId: true } })
    : [];
  const plan = buildOfficeSeedPlan(records, existingOffices, existingLinks);

  if (dryRun) {
    log.info(`[Office Seed] Dry run plan: ${JSON.stringify(plan)}`);
    return plan;
  }

  await db.$transaction(async (tx) => {
    for (const office of records) {
      let current = await findExistingOffice(tx, office);
      if (!current) current = await tx.office.create({ data: officeFields(office), select: { id: true, seedKey: true, verifiedAt: true } });

      for (const link of office.services) {
        const where = { officeId_serviceId: { officeId: current.id, serviceId: link.serviceId } };
        const existingLink = await tx.officeService.findUnique({ where, select: { id: true, verifiedAt: true } });
        if (!existingLink) {
          await tx.officeService.create({
            data: {
              officeId: current.id,
              serviceId: link.serviceId,
              sourceName: link.sourceName,
              sourceUrl: link.sourceUrl,
              verifiedAt: new Date(link.verifiedAt)
            }
          });
        } else if (!existingLink.verifiedAt || new Date(link.verifiedAt) > existingLink.verifiedAt) {
          await tx.officeService.update({
            where,
            data: {
              sourceName: link.sourceName,
              sourceUrl: link.sourceUrl,
              verifiedAt: new Date(link.verifiedAt)
            }
          });
        }
      }
    }
  });
  log.info(`[Office Seed] Processed ${records.length} office directory records; category associations may be prototype assumptions`);
  return plan;
};
