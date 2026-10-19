import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { calculateHaversineDistance, createOfficeSearch } from '../../src/modules/offices/office.service.js';
import { officeQuerySchema } from '../../src/modules/offices/office.schema.js';
import { OFFICE_RECORDS } from '../../src/utils/officeSeed.js';
import officeRoutes from '../../src/modules/offices/office.routes.js';
import { isDbConnected } from '../../src/config/db.js';

const SERVICE_IDS = {
  income: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  caste: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  domicile: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  birth: 'd4e5f6a7-b8c9-0123-def1-234567890123'
};
const CITY_OFFICE_COUNTS = { Ghaziabad: 14, Noida: 18, Lucknow: 16, Delhi: 18, Mumbai: 20, Kolkata: 20, Chennai: 20, Bengaluru: 20 };
const cityServiceCount = {
  Ghaziabad: { income: 4, caste: 4, domicile: 3, birth: 0 },
  Noida: { income: 5, caste: 4, domicile: 5, birth: 0 },
  Lucknow: { income: 4, caste: 4, domicile: 4, birth: 0 },
  Delhi: { income: 0, caste: 0, domicile: 0, birth: 4 },
  Mumbai: { income: 0, caste: 0, domicile: 0, birth: 0 },
  Kolkata: { income: 0, caste: 0, domicile: 0, birth: 0 },
  Chennai: { income: 0, caste: 0, domicile: 0, birth: 0 },
  Bengaluru: { income: 0, caste: 0, domicile: 0, birth: 0 }
};

const sampleOffices = [
  { id: 'near', name: 'Near', address: '1 Main Rd', city: 'Delhi', state: 'Delhi', pincode: '110001', latitude: 28.61, longitude: 77.21, sourceName: 'District directory', sourceUrl: 'https://example.gov.in/office', verifiedAt: new Date('2026-10-18T00:00:00.000Z'), services: [{ serviceId: 'svc-a', service: { id: 'svc-a', name: 'Income Certificate' }, sourceName: 'Service directory', sourceUrl: 'https://example.gov.in/service', verifiedAt: new Date('2026-10-17T00:00:00.000Z') }] },
  { id: 'far', name: 'Far', address: '2 Main Rd', city: 'Delhi', state: 'Delhi', pincode: '110002', latitude: 28.7, longitude: 77.3, services: [{ serviceId: 'svc-b' }] },
  { id: 'unknown', name: 'Unknown location', address: '3 Main Rd', city: 'Delhi', state: 'Delhi', pincode: '110003', latitude: null, longitude: null, workingHours: null }
];

const makeSearch = ({ offices = sampleOffices, error, environment = 'test', fallbackOffices = [] } = {}) => {
  const calls = [];
  const errors = [];
  const db = { office: { findMany: async (args) => {
    calls.push(args);
    if (error) throw error;
    return offices.filter((office) => {
      const { city, state, services } = args.where;
      if (city && office.city?.trim().toLocaleLowerCase() !== city.equals.trim().toLocaleLowerCase()) return false;
      if (state && office.state?.trim().toLocaleLowerCase() !== state.equals.trim().toLocaleLowerCase()) return false;
      if (services && !office.services?.some((service) => service.serviceId === services.some.serviceId)) return false;
      return true;
    });
  } } };
  const search = createOfficeSearch({ db, dbConnected: true, fallbackOffices, environment, log: { error: (...args) => errors.push(args), warn: (...args) => errors.push(args) } });
  return { search, calls, errors };
};

test('filters city and state and filters through the OfficeService relation', async () => {
  const { search, calls } = makeSearch();
  const [result] = await search({ city: 'Delhi', state: 'Delhi', serviceId: 'svc-a' });
  assert.deepEqual(calls[0].where, {
    city: { equals: 'Delhi', mode: 'insensitive' },
    state: { equals: 'Delhi', mode: 'insensitive' },
    services: { some: { serviceId: 'svc-a' } }
  });
  assert.equal(calls[0].include.services.include.service, true);
  assert.equal(result.sourceUrl, 'https://example.gov.in/office');
  assert.equal(result.services[0].name, 'Income Certificate');
  assert.equal(result.services[0].sourceUrl, 'https://example.gov.in/service');
  assert.equal(result.services[0].verificationStatus, 'unknown');
});

test('curated research metadata survives API shaping and known catalogue IDs cannot cross regions', async () => {
  const curated = OFFICE_RECORDS.find((office) => office.researchMetadata.categoryAssignments.length > 0);
  const { search } = makeSearch({ offices: [curated], fallbackOffices: OFFICE_RECORDS, environment: 'production' });
  const [result] = await search({ city: curated.city, state: curated.state });
  assert.equal(result.addressVerificationStatus, curated.addressVerificationStatus);
  assert.deepEqual(result.researchMetadata, curated.researchMetadata);
  assert.ok(result.researchSourceUrls.length > 0);

  const wrongRegion = {
    id: 'wrong-region', name: 'Wrong Region', city: 'Bengaluru', state: 'Karnataka',
    latitude: null, longitude: null, services: [{ serviceId: SERVICE_IDS.birth }]
  };
  const wrongRegionSearch = makeSearch({ offices: [wrongRegion] }).search;
  assert.deepEqual(await wrongRegionSearch({ serviceId: SERVICE_IDS.birth }), []);
});

test('All Services database query has no service restriction or result cap', async () => {
  const { search, calls } = makeSearch({ offices: OFFICE_RECORDS });
  const allCityResults = await search({ city: 'Ghaziabad' });
  assert.equal(allCityResults.length, CITY_OFFICE_COUNTS.Ghaziabad);
  assert.deepEqual(calls[0].where, { city: { equals: 'Ghaziabad', mode: 'insensitive' } });
  assert.equal('take' in calls[0], false);
  assert.equal('skip' in calls[0], false);
  assert.equal(OFFICE_RECORDS.length, 146);
});

test('database search normalizes exact city and state filters and supports state-only or unfiltered queries', async () => {
  const { search } = makeSearch({ offices: OFFICE_RECORDS });
  assert.equal((await search({ city: 'mUmBaI' })).length, CITY_OFFICE_COUNTS.Mumbai);
  assert.deepEqual([...new Set((await search({ state: ' uTtAr PrAdEsH ' })).map((office) => office.city))].sort(), ['Ghaziabad', 'Lucknow', 'Noida']);
  assert.deepEqual((await search({ city: '  gHaZiAbAd ', state: ' uTtAr PrAdEsH ' })).map((office) => office.city), Array(CITY_OFFICE_COUNTS.Ghaziabad).fill('Ghaziabad'));
  assert.deepEqual(await search({ city: 'Mumbai', state: 'Uttar Pradesh' }), []);
  assert.deepEqual(await search({ city: 'Unknown City', state: 'Unknown State' }), []);
  assert.equal((await search({})).length, 146);
});

test('database results fall back to the complete curated city when the database is partial', async () => {
  const { search } = makeSearch({ offices: [OFFICE_RECORDS[0]], fallbackOffices: OFFICE_RECORDS });
  const results = await search({ city: 'Ghaziabad' });
  assert.equal(results.length, CITY_OFFICE_COUNTS.Ghaziabad);
  assert.equal(new Set(results.map(({ id }) => id)).size, CITY_OFFICE_COUNTS.Ghaziabad);
});

test('curated coordinates fill missing database coordinates for matching directory records', async () => {
  const curated = [{ seedKey: 'coordinate-office', name: 'Coordinate Office', city: 'Delhi', state: 'Delhi', latitude: 0.01, longitude: 0.01, coordinateSource: 'Official map', coordinateSourceUrl: 'https://example.gov.in/map', coordinateApproximate: true, services: [] }];
  const database = [{ id: 'db-coordinate-office', seedKey: 'coordinate-office', name: 'Coordinate Office', city: 'Delhi', state: 'Delhi', latitude: null, longitude: null, services: [] }];
  const { search } = makeSearch({ offices: database, fallbackOffices: curated });
  const [result] = await search({ latitude: 0, longitude: 0, radiusKm: 2 });
  assert.equal(result.id, 'db-coordinate-office');
  assert.equal(result.latitude, 0.01);
  assert.equal(result.coordinateSourceUrl, 'https://example.gov.in/map');
  assert.equal(result.coordinateSource, 'Official map');
  assert.equal(result.coordinateApproximate, true);
});

test('JSON fallback uses the same city and state filters and supports a development all-office query', async () => {
  const search = createOfficeSearch({ db: null, dbConnected: false, fallbackOffices: OFFICE_RECORDS, environment: 'development' });
  assert.equal((await search({ city: 'mUmBaI' })).length, CITY_OFFICE_COUNTS.Mumbai);
  assert.deepEqual([...new Set((await search({ state: ' uTtAr PrAdEsH ' })).map((office) => office.city))].sort(), ['Ghaziabad', 'Lucknow', 'Noida']);
  assert.deepEqual((await search({ city: 'Noida', state: 'Delhi' })), []);
  assert.deepEqual((await search({ city: 'Unknown City' })), []);
  assert.deepEqual((await search({ city: 'Unknown City', state: 'Unknown State' })), []);
  assert.equal((await search({})).length, 146);
});

test('every curated city has the expected state', () => {
  const expectedStates = {
    Ghaziabad: 'Uttar Pradesh', Delhi: 'Delhi', Mumbai: 'Maharashtra', Kolkata: 'West Bengal',
    Chennai: 'Tamil Nadu', Lucknow: 'Uttar Pradesh', Bengaluru: 'Karnataka', Noida: 'Uttar Pradesh'
  };
  assert.deepEqual(new Set(OFFICE_RECORDS.map(({ city }) => city)), new Set(Object.keys(expectedStates)));
  for (const office of OFFICE_RECORDS) assert.equal(office.state, expectedStates[office.city], office.city);
});

test('All Services and category filters reflect documented office counts and report gaps', async () => {
  const { search } = makeSearch({ offices: OFFICE_RECORDS });
  assert.equal(OFFICE_RECORDS.length, 146);
  const ghaziabadAll = await search({ city: 'Ghaziabad', state: 'Uttar Pradesh' });
  assert.equal(ghaziabadAll.length, CITY_OFFICE_COUNTS.Ghaziabad);
  assert.deepEqual([...new Set(ghaziabadAll.map(({ city }) => city))], ['Ghaziabad']);
  assert.equal((await search({})).length, 146, 'unfiltered development query includes all curated offices');
  for (const { city } of OFFICE_RECORDS) {
    const results = await search({ city });
    assert.equal(results.length, CITY_OFFICE_COUNTS[city], `${city} All Services`);
    assert.equal(new Set(results.map(({ name }) => name)).size, CITY_OFFICE_COUNTS[city], `${city} offices stay separate`);
  }
  for (const [serviceKey, serviceId] of Object.entries(SERVICE_IDS)) {
    let total = 0;
    for (const city of new Set(OFFICE_RECORDS.map(({ city }) => city))) {
      const results = await search({ city, serviceId });
      assert.equal(results.length, cityServiceCount[city][serviceKey], `${city}/${serviceKey}`);
      total += results.length;
    }
    assert.equal(total, { birth: 4, caste: 12, income: 13, domicile: 12 }[serviceKey], `${serviceKey} region-compatible directory links`);
  }
});

test('normalized service categories include researched assignments across all eight cities', async () => {
  const search = createOfficeSearch({ db: null, dbConnected: false, fallbackOffices: OFFICE_RECORDS, environment: 'development' });
  const categories = ['Birth Certificate', 'Caste Certificate', 'Income Certificate', 'Domicile Certificate'];
  const cities = [...new Set(OFFICE_RECORDS.map(({ city, state }) => JSON.stringify([city, state])))].map((value) => JSON.parse(value));

  for (const [city, state] of cities) {
    const all = await search({ city, state });
    assert.equal(all.length, CITY_OFFICE_COUNTS[city], `${city} All services`);
    for (const category of categories) {
      const expected = OFFICE_RECORDS.filter((office) => office.city === city && office.state === state && (
        office.researchMetadata.categoryAssignments.some((assignment) => assignment.category === category) ||
        office.services.some((link) => link.serviceName === category)
      ));
      const results = await search({ city, state, serviceCategory: category.toLocaleUpperCase() });
      assert.deepEqual(results.map(({ id }) => id).sort(), expected.map(({ seedKey }) => seedKey).sort(), `${city}/${category}`);
      assert.ok(results.every((office) =>
        office.researchMetadata.categoryAssignments.some((assignment) => assignment.category === category) ||
        office.services.some((link) => link.name === category)
      ), `${city}/${category} contains only assigned records`);
    }
  }

  const mumbaiCaste = await search({ city: 'Mumbai', state: 'Maharashtra', serviceCategory: '  caste certificate ' });
  assert.equal(mumbaiCaste.length, 4);
  assert.ok(mumbaiCaste.every((office) => office.researchMetadata.categoryAssignments.some((assignment) => assignment.category === 'Caste Certificate')));
});

test('category, city, and radius filters compose and exclude unassigned or unlocated offices', async () => {
  const offices = [
    { id: 'near-caste', name: 'Near caste office', city: 'Mumbai', state: 'Maharashtra', latitude: 19.076, longitude: 72.8777, services: [], researchMetadata: { categoryAssignments: [{ category: 'Caste Certificate', status: 'demo_assumed' }] } },
    { id: 'far-caste', name: 'Far caste office', city: 'Mumbai', state: 'Maharashtra', latitude: 20, longitude: 72.8777, services: [], researchMetadata: { categoryAssignments: [{ category: 'Caste Certificate', status: 'demo_assumed' }] } },
    { id: 'unknown-caste', name: 'Unlocated caste office', city: 'Mumbai', state: 'Maharashtra', latitude: null, longitude: null, services: [], researchMetadata: { categoryAssignments: [{ category: 'Caste Certificate', status: 'demo_assumed' }] } },
    { id: 'near-income', name: 'Near income office', city: 'Mumbai', state: 'Maharashtra', latitude: 19.076, longitude: 72.8777, services: [], researchMetadata: { categoryAssignments: [{ category: 'Income Certificate', status: 'demo_assumed' }] } },
    { id: 'other-city', name: 'Other city caste office', city: 'Delhi', state: 'Delhi', latitude: 19.076, longitude: 72.8777, services: [], researchMetadata: { categoryAssignments: [{ category: 'Caste Certificate', status: 'demo_assumed' }] } }
  ];
  const search = createOfficeSearch({ db: null, dbConnected: false, fallbackOffices: offices, environment: 'development' });
  const results = await search({ city: 'Mumbai', state: 'Maharashtra', serviceCategory: 'Caste Certificate', latitude: 19.076, longitude: 72.8777, radiusKm: 5 });
  assert.deepEqual(results.map(({ id }) => id), ['near-caste']);
  assert.equal(results.distanceUnavailableCount, 1);
});

test('city and service filters compose and return the single category-linked office', async () => {
  const fallbackSearch = createOfficeSearch({ db: null, dbConnected: false, fallbackOffices: OFFICE_RECORDS, environment: 'development' });
  for (const city of new Set(OFFICE_RECORDS.map(({ city }) => city))) {
    const expectedState = OFFICE_RECORDS.find((office) => office.city === city).state;
    const allServices = await fallbackSearch({ city, state: expectedState });
    assert.equal(allServices.length, CITY_OFFICE_COUNTS[city], `${city} All Services fallback`);
    assert.ok(allServices.every((office) => office.city === city && office.state === expectedState));
    for (const serviceId of Object.values(SERVICE_IDS)) {
      const results = await fallbackSearch({ city, serviceId });
      const serviceKey = Object.keys(SERVICE_IDS).find((key) => SERVICE_IDS[key] === serviceId);
      assert.equal(results.length, cityServiceCount[city][serviceKey], `${city}/${serviceId}`);
      if (!results.length) continue;
      assert.ok(results[0].services.some((link) => link.id === serviceId && link.verificationStatus === 'demo_assumed'));
    }
  }
});

test('every curated service relationship uses a catalogue ID with dated source metadata', () => {
  const knownServiceIds = new Set(Object.values(SERVICE_IDS));
  for (const office of OFFICE_RECORDS) {
    for (const link of office.services || []) {
      assert.ok(knownServiceIds.has(link.serviceId), `${office.name}: unsupported service ID ${link.serviceId}`);
      assert.equal(typeof link.serviceName, 'string');
      assert.ok(link.serviceName.trim());
      assert.equal(typeof link.sourceName, 'string');
      assert.ok(link.sourceName.trim());
      assert.ok(['verified', 'demo_assumed'].includes(link.verificationStatus));
      assert.doesNotThrow(() => {
        const source = new URL(link.sourceUrl);
        assert.equal(source.protocol, 'https:');
      });
      assert.ok(Number.isFinite(Date.parse(link.verifiedAt)), `${office.name}: invalid verification date`);
    }
  }
});

test('category filters return configured offices and identify incomplete city/category coverage', async () => {
  const { search } = makeSearch({ offices: OFFICE_RECORDS });
  const cities = [
    ['Ghaziabad', 'Uttar Pradesh'], ['Noida', 'Uttar Pradesh'], ['Delhi', 'Delhi'],
    ['Mumbai', 'Maharashtra'], ['Kolkata', 'West Bengal'], ['Chennai', 'Tamil Nadu'],
    ['Lucknow', 'Uttar Pradesh'], ['Bengaluru', 'Karnataka']
  ];
  for (const [city, state] of cities) {
    for (const [serviceKey, serviceId] of Object.entries(SERVICE_IDS)) {
      const result = await search({ city, state, serviceId });
      assert.equal(result.length, cityServiceCount[city][serviceKey], `${city}/${state} ${serviceKey}`);
      assert.ok(result.every((office) => office.city === city && office.state === state));
    }
  }
  const complete = Object.keys(CITY_OFFICE_COUNTS).every((city) => CITY_OFFICE_COUNTS[city] === 16) &&
    Object.keys(CITY_OFFICE_COUNTS).every((city) => Object.keys(SERVICE_IDS).every((key) => cityServiceCount[city][key] === 4));
  if (complete) assert.equal(OFFICE_RECORDS.length, 128, 'a complete directory contains 128 offices');
  else assert.equal(OFFICE_RECORDS.length, 146, 'merged directory retains existing and accepted research identities');
});

test('city, state, and service filters compose; unknown service IDs return no offices', async () => {
  const { search } = makeSearch({ offices: OFFICE_RECORDS });
  const validServiceId = SERVICE_IDS.income;
  assert.equal((await search({ city: 'ghaziabad', state: 'UTTAR PRADESH', serviceId: validServiceId })).length, 4);
  assert.equal((await search({ city: 'lucknow', state: 'uTtAr PrAdEsH', serviceId: validServiceId })).length, 4);
  assert.equal((await search({ city: 'Mumbai', state: 'Maharashtra', serviceId: validServiceId })).length, 0);
  assert.deepEqual(await search({ city: 'Ghaziabad', serviceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }), []);
});

test('JSON fallback matches by service ID and excludes offices without that relationship', async () => {
  const search = createOfficeSearch({ db: null, dbConnected: false, fallbackOffices: OFFICE_RECORDS, environment: 'development' });
  const serviceId = SERVICE_IDS.income;
  const results = await search({ city: 'Ghaziabad', state: 'Uttar Pradesh', serviceId });
  assert.deepEqual(results.map(({ name }) => name), [
    'Tehsil Ghaziabad', 'Tehsil Modinagar', 'Tehsil Loni', 'Jan Suvidha Kendra – Tehsil Ghaziabad'
  ]);
  assert.equal(results[0].services[0].id, serviceId);
  assert.equal(results[0].services[0].name, 'Income Certificate');
  assert.equal((await search({ city: 'Ghaziabad', state: 'Uttar Pradesh', serviceId: SERVICE_IDS.birth })).length, 0);
});

test('calculates valid Haversine distance and rejects invalid coordinates', () => {
  assert.equal(calculateHaversineDistance(0, 0, 0, 1), 111.19492664455873);
  assert.equal(calculateHaversineDistance(91, 0, 0, 0), null);
  assert.equal(calculateHaversineDistance(0, 0, null, null), null);
});

test('sorts calculable distances first and leaves unknown locations afterward', async () => {
  const { search } = makeSearch();
  const results = await search({ city: 'Delhi', state: 'Delhi', latitude: 28.6, longitude: 77.2 });
  assert.deepEqual(results.map((office) => office.id), ['near', 'far', 'unknown']);
  assert.equal(results[2].distanceKm, undefined);
});

test('radius excludes offices whose distance cannot be established', async () => {
  const { search } = makeSearch();
  const results = await search({ latitude: 28.6, longitude: 77.2, radiusKm: 3 });
  assert.deepEqual(results.map((office) => office.id), ['near']);
  assert.ok(results.every((office) => office.distanceKm <= 3));
  assert.equal(results.some((office) => office.id === 'unknown'), false);
  assert.equal(results.distanceUnavailableCount, 1);
});

test('radius filtering is consistent for All Services and a category in database and JSON fallback', async () => {
  const categoryIds = ['svc-income', 'svc-caste', 'svc-domicile', 'svc-birth'];
  const categorizedOffices = categoryIds.flatMap((serviceId) => [
    { id: `near-${serviceId}`, name: 'Near', city: 'Ghaziabad', state: 'Uttar Pradesh', latitude: 28.751, longitude: 77.499, services: [{ serviceId }] },
    { id: `far-${serviceId}`, name: 'Far', city: 'Ghaziabad', state: 'Uttar Pradesh', latitude: 29.751, longitude: 77.499, services: [{ serviceId }] },
    { id: `unknown-${serviceId}`, name: 'Unknown', city: 'Ghaziabad', state: 'Uttar Pradesh', latitude: null, longitude: null, services: [{ serviceId }] }
  ]);
  const databaseSearch = makeSearch({ offices: categorizedOffices }).search;
  const fallbackSearch = createOfficeSearch({ db: null, dbConnected: false, fallbackOffices: categorizedOffices, environment: 'development' });
  const allFilters = { city: 'Ghaziabad', state: 'Uttar Pradesh', latitude: 28.751, longitude: 77.499, radiusKm: 1 };
  const dbAll = await databaseSearch(allFilters);
  const fallbackAll = await fallbackSearch(allFilters);
  assert.deepEqual(dbAll.map(({ id }) => id), fallbackAll.map(({ id }) => id));
  assert.equal(dbAll.length, 4);
  assert.equal(dbAll.distanceUnavailableCount, 4);
  for (const serviceId of categoryIds) {
    const filters = { ...allFilters, serviceId };
    const dbResults = await databaseSearch(filters);
    const fallbackResults = await fallbackSearch(filters);
    assert.deepEqual(dbResults.map(({ id }) => id), fallbackResults.map(({ id }) => id));
    assert.equal(dbResults.length, 1);
    assert.equal(dbResults[0].id, `near-${serviceId}`);
    assert.equal(dbResults[0].distanceKm, 0);
    assert.equal(dbResults.distanceUnavailableCount, 1);
  }
  assert.equal((await fallbackSearch({ city: 'Ghaziabad', serviceId: 'svc-birth' })).length, 3, 'missing radius leaves matching category results unrestricted');
});

test('radius helper rejects invalid coordinates and radius instead of bypassing distance filtering', async () => {
  const { search } = makeSearch();
  await assert.rejects(search({ radiusKm: 10 }), /requires valid latitude and longitude/);
  await assert.rejects(search({ city: 'Delhi', latitude: 91, longitude: 0 }), /valid coordinate pair/);
  await assert.rejects(search({ latitude: 28, longitude: 77, radiusKm: Infinity }), /finite positive/);
  await assert.rejects(search({ latitude: 28, longitude: 77, radiusKm: 0 }), /finite positive/);
});

test('10 km and 100 km radius searches use calculated distances and exclude outside or unlocated offices', async () => {
  // Synthetic coordinates isolate distance/radius behavior; they are not curated office data.
  const origin = { latitude: 28.751620, longitude: 77.499286 };
  const coordinateOffices = [
    { id: 'close', name: 'Close test office', city: 'Ghaziabad', state: 'Uttar Pradesh', latitude: 28.75, longitude: 77.5 },
    { id: 'mid', name: 'Mid-range test office', city: 'Ghaziabad', state: 'Uttar Pradesh', latitude: 28.2, longitude: 77.5 },
    { id: 'far', name: 'Far test office', city: 'Ghaziabad', state: 'Uttar Pradesh', latitude: 27.3, longitude: 77.5 },
    { id: 'unknown-coordinates', name: 'Unlocated test office', city: 'Ghaziabad', state: 'Uttar Pradesh', latitude: null, longitude: null }
  ];
  const search = createOfficeSearch({
    db: null, dbConnected: false, fallbackOffices: coordinateOffices, environment: 'development'
  });

  const within10 = await search({ ...origin, radiusKm: 10 });
  assert.deepEqual(within10.map(({ id }) => id), ['close']);
  assert.ok(within10[0].distanceKm <= 10);

  const within100 = await search({ ...origin, radiusKm: 100 });
  assert.deepEqual(within100.map(({ id }) => id), ['close', 'mid']);
  assert.ok(within100.every(({ distanceKm }) => distanceKm <= 100));

  assert.deepEqual(await search({ ...origin, radiusKm: 0.1 }), []);
});

test('Ghaziabad radius search uses the browser origin and office coordinates, excluding offices outside the radius', async () => {
  assert.equal(OFFICE_RECORDS.filter((office) => office.latitude === null && office.longitude === null).length, 132);
  const search = createOfficeSearch({
    db: null,
    dbConnected: false,
    fallbackOffices: OFFICE_RECORDS,
    environment: 'development'
  });
  const filters = {
    city: 'Ghaziabad', state: 'Uttar Pradesh', serviceId: SERVICE_IDS.caste,
    latitude: 28.751620, longitude: 77.499286
  };
  const withinRadius = await search({ ...filters, radiusKm: 10 });
  assert.deepEqual(withinRadius.map((office) => office.id), ['ghaziabad-07', 'ghaziabad-05']);
  assert.equal(withinRadius.distanceUnavailableCount, 0);
  const withoutRadius = await search(filters);
  assert.equal(withoutRadius.length, 4);
});

test('handles absent office coordinates and does not invent working hours', async () => {
  const { search } = makeSearch();
  const unknown = (await search({ city: 'Delhi' })).find((office) => office.id === 'unknown');
  assert.equal(unknown.latitude, null);
  assert.equal(unknown.longitude, null);
  assert.equal(unknown.workingHours, null);
});

test('radius search uses the sourced approximate Ghaziabad Collectorate point and counts unresolved offices accurately', async () => {
  const search = createOfficeSearch({ db: null, dbConnected: false, fallbackOffices: OFFICE_RECORDS, environment: 'development' });
  const results = await search({
    city: 'Ghaziabad', state: 'Uttar Pradesh',
    latitude: 28.6729, longitude: 77.4473, radiusKm: 0.1
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'District Magistrate Office, Collectorate');
  assert.equal(results[0].coordinateApproximate, true);
  assert.equal(results[0].coordinateSourceUrl, OFFICE_RECORDS[0].coordinateSourceUrl);
  assert.ok(results[0].distanceKm <= 0.1);
  assert.equal(results.distanceUnavailableCount, 0);
});

test('stores all ten supplied Ghaziabad points and preserves the four existing coordinate records', () => {
  const supplied = new Map([
    ['ghaziabad-01', [28.6631, 77.4339]],
    ['ghaziabad-02', [28.6798, 77.3739]],
    ['ghaziabad-03', [28.6416, 77.4475]],
    ['ghaziabad-04', [28.6588, 77.3687]],
    ['ghaziabad-05', [28.6712, 77.4561]],
    ['ghaziabad-06', [28.6652, 77.4422]],
    ['ghaziabad-07', [28.6825, 77.4468]],
    ['ghaziabad-12', [28.6653, 77.4419]],
    ['ghaziabad-13', [28.7513, 77.2882]],
    ['ghaziabad-14', [28.8415, 77.5816]]
  ]);
  for (const [seedKey, [latitude, longitude]] of supplied) {
    const office = OFFICE_RECORDS.find((record) => record.seedKey === seedKey);
    assert.ok(office, `Missing office identity ${seedKey}`);
    assert.equal(office.latitude, latitude, `${seedKey} latitude`);
    assert.equal(office.longitude, longitude, `${seedKey} longitude`);
    assert.equal(office.coordinateSource, 'User-provided approximate coordinates');
    assert.equal(office.coordinateSourceUrl, null);
    assert.equal(office.coordinateApproximate, true);
  }
  const existing = new Map([
    ['ghaziabad-tehsil-ghaziabad-caste', [28.696822, 77.450649]],
    ['ghaziabad-collectorate-birth', [28.67283, 77.44731]],
    ['ghaziabad-tehsil-modinagar-domicile', [28.841, 77.591]],
    ['ghaziabad-tehsil-loni-income', [28.75, 77.28]]
  ]);
  for (const [seedKey, [latitude, longitude]] of existing) {
    const office = OFFICE_RECORDS.find((record) => record.seedKey === seedKey);
    assert.equal(office.latitude, latitude, `${seedKey} latitude remains intact`);
    assert.equal(office.longitude, longitude, `${seedKey} longitude remains intact`);
    assert.equal(office.coordinateApproximate, true);
  }
  assert.equal(OFFICE_RECORDS.filter((office) => office.city === 'Ghaziabad' && office.latitude != null && office.longitude != null).length, 14);
});

test('calculates Ghaziabad distances dynamically from the supplied origin and applies radius filtering', async () => {
  const referenceOrigin = { latitude: 28.751582, longitude: 77.499320 };
  const references = [
    ['ghaziabad-tehsil-ghaziabad-caste', 7.70],
    ['ghaziabad-collectorate-birth', 10.50],
    ['ghaziabad-tehsil-modinagar-domicile', 13.40],
    ['ghaziabad-tehsil-loni-income', 21.40],
    ['ghaziabad-01', 12.00],
    ['ghaziabad-02', 14.00],
    ['ghaziabad-03', 14.00],
    ['ghaziabad-04', 16.70],
    ['ghaziabad-05', 10.25],
    ['ghaziabad-06', 11.49],
    ['ghaziabad-07', 8.50],
    ['ghaziabad-12', 7.78],
    ['ghaziabad-13', 20.40],
    ['ghaziabad-14', 10.84]
  ];
  const search = createOfficeSearch({
    db: null, dbConnected: false, fallbackOffices: OFFICE_RECORDS, environment: 'development'
  });
  const results = await search({ ...referenceOrigin, city: 'Ghaziabad', state: 'Uttar Pradesh' });
  const observed = new Map(results.map((office) => [office.id, office]));

  for (const [seedKey, expectedKm] of references) {
    const office = observed.get(seedKey);
    assert.ok(office, `Missing Ghaziabad reference office ${seedKey}`);
    assert.ok(Number.isFinite(expectedKm), `Reference value for ${seedKey} is retained in the test fixture`);
    assert.ok(Number.isFinite(office.latitude) && Number.isFinite(office.longitude), `${seedKey} coordinates`);
    const calculatedKm = Number(calculateHaversineDistance(
      referenceOrigin.latitude, referenceOrigin.longitude, office.latitude, office.longitude
    ).toFixed(1));
    assert.equal(office.distanceKm, calculatedKm, `${seedKey} badge must use dynamic Haversine distance`);
  }
  assert.equal(references.length, 14);

  const radius = 15;
  const withinRadius = await search({ ...referenceOrigin, city: 'Ghaziabad', state: 'Uttar Pradesh', radiusKm: radius });
  assert.ok(withinRadius.length > 0 && withinRadius.length < references.length);
  assert.ok(withinRadius.every((office) => office.distanceKm <= radius));
  const expectedIds = results.filter((office) => office.distanceKm <= radius).map((office) => office.id).sort();
  assert.deepEqual(withinRadius.map((office) => office.id).sort(), expectedIds);
});

test('uses matching curated fallback for an empty database result outside production only', async () => {
  const { search } = makeSearch({ offices: [], fallbackOffices: sampleOffices });
  assert.equal((await search({ city: 'Delhi' })).length, sampleOffices.length);
  const production = makeSearch({ offices: [], fallbackOffices: sampleOffices, environment: 'production' });
  assert.deepEqual(await production.search({ city: 'Delhi' }), []);
});

test('production returns database matches without replacing them with an incomplete curated directory', async () => {
  const [databaseOffice] = OFFICE_RECORDS;
  const production = makeSearch({ offices: [databaseOffice], fallbackOffices: OFFICE_RECORDS, environment: 'production' });
  const results = await production.search({ city: 'Ghaziabad', state: 'Uttar Pradesh' });
  assert.equal(results.length, 1);
  assert.equal(results[0].id, databaseOffice.id || databaseOffice.seedKey);
});

test('database matches are deduplicated in production too', async () => {
  const duplicate = { ...sampleOffices[0] };
  const production = makeSearch({ offices: [sampleOffices[0], duplicate], environment: 'production' });
  const results = await production.search({ city: 'Delhi', state: 'Delhi' });
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'near');
});

test('reproduces empty database result for Mumbai and returns the curated record in development', async () => {
  const { search, calls } = makeSearch({ offices: [], fallbackOffices: OFFICE_RECORDS, environment: 'development' });
  const results = await search({ city: 'mUmBaI', state: 'maharashtra' });
  assert.equal(results.length, CITY_OFFICE_COUNTS.Mumbai);
  assert.ok(results.every(({ city, state }) => city === 'Mumbai' && state === 'Maharashtra'));
  assert.deepEqual(calls[0].where, {
    city: { equals: 'mUmBaI', mode: 'insensitive' },
    state: { equals: 'maharashtra', mode: 'insensitive' }
  });
});

test('GET /api/v1/offices returns Mumbai through the real Express route with database disconnected', async () => {
  assert.equal(isDbConnected, false);
  const app = express();
  app.use('/api/v1/offices', officeRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/offices?city=Mumbai&state=Maharashtra`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(Array.isArray(body.data), true);
    assert.equal(body.data.length, CITY_OFFICE_COUNTS.Mumbai);
    assert.ok(body.data.every((office) => office.city === 'Mumbai' && office.state === 'Maharashtra'));
    assert.ok(body.data.every((office) => office.sourceUrl));
    const radiusResponse = await fetch(`http://127.0.0.1:${port}/api/v1/offices?latitude=28.751620&longitude=77.499286&radiusKm=10`);
    const radiusBody = await radiusResponse.json();
    assert.equal(radiusBody.data.length, 3);
    assert.equal(radiusBody.data[0].name, 'Tehsil Ghaziabad');
    assert.ok(radiusBody.data.every((office) => office.distanceKm <= 10));
    assert.equal(radiusBody.message, undefined);
    const serviceResponse = await fetch(`http://127.0.0.1:${port}/api/v1/offices?city=Ghaziabad&serviceId=${SERVICE_IDS.birth}`);
    const serviceBody = await serviceResponse.json();
    assert.equal(serviceBody.data.length, 0, 'Delhi-scoped Birth ID is not used for Ghaziabad');
    const categoryResponse = await fetch(`http://127.0.0.1:${port}/api/v1/offices?city=Mumbai&state=Maharashtra&serviceCategory=Caste%20Certificate`);
    const categoryBody = await categoryResponse.json();
    assert.equal(categoryBody.data.length, 4);
    assert.ok(categoryBody.data.every((office) => office.researchMetadata.categoryAssignments.some((assignment) => assignment.category === 'Caste Certificate')));
    assert.equal(categoryBody.message, undefined);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('falls back to the matching curated record for each of the eight target cities', async () => {
  const { search } = makeSearch({ offices: [], fallbackOffices: OFFICE_RECORDS, environment: 'development' });
  for (const expected of OFFICE_RECORDS) {
    const results = await search({ city: expected.city, state: expected.state });
    const result = results.find(({ name }) => name === expected.name);
    assert.ok(result, `Expected ${expected.name} for ${expected.city}`);
    assert.equal(result.city, expected.city);
    assert.equal(result.state, expected.state);
    assert.equal(result.sourceUrl, expected.sourceUrl);
  }
});

test('does not return unrelated fallback records when a database query has no matching location', async () => {
  const { search } = makeSearch({ offices: [], fallbackOffices: OFFICE_RECORDS, environment: 'development' });
  assert.deepEqual(await search({ city: 'Mumbai', state: 'Delhi' }), []);
  assert.deepEqual(await search({ city: 'Unknown City', state: 'Unknown State' }), []);
});

test('logs and propagates database failures in production', async () => {
  const failure = new Error('database unavailable');
  const { search, errors } = makeSearch({ error: failure, environment: 'production', fallbackOffices: sampleOffices });
  await assert.rejects(search({ city: 'Delhi' }), failure);
  assert.equal(errors.length, 1);
});

test('uses in-memory fallback only outside production when the database query fails', async () => {
  const fallback = [{ id: 'fallback', name: 'Fallback', city: 'Delhi', state: 'Delhi' }];
  const { search } = makeSearch({ error: new Error('offline'), fallbackOffices: fallback });
  assert.deepEqual((await search({ city: 'Delhi' })).map(({ id }) => id), ['fallback']);
  const production = makeSearch({ error: new Error('offline'), fallbackOffices: fallback, environment: 'production' });
  await assert.rejects(production.search({ city: 'Delhi' }), /offline/);
});

test('uses in-memory fallback when the database is disconnected outside production', async () => {
  const fallback = [{ id: 'fallback', name: 'Fallback', city: 'Delhi', state: 'Delhi' }];
  const search = createOfficeSearch({ db: null, dbConnected: false, fallbackOffices: fallback, environment: 'development' });
  assert.deepEqual((await search({ city: 'Delhi' })).map(({ id }) => id), ['fallback']);
});

test('requires paired GPS coordinates and requires GPS coordinates for radius', () => {
  assert.equal(officeQuerySchema.safeParse({ radiusKm: '5' }).success, false);
  assert.equal(officeQuerySchema.safeParse({ latitude: '28.6' }).success, false);
  assert.equal(officeQuerySchema.safeParse({ latitude: '28.6', longitude: '77.2', radiusKm: '5' }).success, true);
  assert.equal(officeQuerySchema.safeParse({ city: ' Delhi ', radiusKm: '' }).data.city, 'Delhi');
  assert.equal(officeQuerySchema.safeParse({}).success, true);
  assert.equal(officeQuerySchema.safeParse({ state: 'Delhi' }).success, true);
  assert.equal(officeQuerySchema.safeParse({ latitude: '28.6', longitude: '77.2' }).success, true);
  assert.equal(officeQuerySchema.safeParse({ latitude: '28.6x', longitude: '77.2' }).success, false);
  assert.equal(officeQuerySchema.safeParse({ latitude: 'Infinity', longitude: '77.2' }).success, false);
  assert.equal(officeQuerySchema.safeParse({ latitude: '28.6', longitude: '77.2', radiusKm: 'Infinity' }).success, false);
  const emptyGpsRadius = officeQuerySchema.safeParse({ latitude: '28.6', longitude: '77.2', radiusKm: '' });
  assert.equal(emptyGpsRadius.success, true);
  assert.equal(emptyGpsRadius.data.radiusKm, undefined);
  const citySearchWithEmptyRadius = officeQuerySchema.safeParse({ city: 'Ghaziabad', state: 'Uttar Pradesh', radiusKm: '' });
  assert.equal(citySearchWithEmptyRadius.success, true);
  assert.equal(citySearchWithEmptyRadius.data.radiusKm, undefined);
  const normalizedCategory = officeQuerySchema.safeParse({ serviceCategory: '  cAsTe certificate ' });
  assert.equal(normalizedCategory.success, true);
  assert.equal(normalizedCategory.data.serviceCategory, 'Caste Certificate');
  assert.equal(officeQuerySchema.safeParse({ serviceCategory: 'Legal Aid' }).success, false);
});
