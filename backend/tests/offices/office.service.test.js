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

test('All Services database query has no service restriction or result cap', async () => {
  const { search, calls } = makeSearch({ offices: OFFICE_RECORDS });
  const allCityResults = await search({ city: 'Ghaziabad' });
  assert.equal(allCityResults.length, 4);
  assert.deepEqual(calls[0].where, { city: { equals: 'Ghaziabad', mode: 'insensitive' } });
  assert.equal('take' in calls[0], false);
  assert.equal('skip' in calls[0], false);
  assert.equal(OFFICE_RECORDS.length, 32);
});

test('database search normalizes exact city and state filters and supports state-only or unfiltered queries', async () => {
  const { search } = makeSearch({ offices: OFFICE_RECORDS });
  assert.deepEqual((await search({ city: 'mUmBaI' })).map((office) => office.city), ['Mumbai', 'Mumbai', 'Mumbai', 'Mumbai']);
  assert.deepEqual([...new Set((await search({ state: ' uTtAr PrAdEsH ' })).map((office) => office.city))].sort(), ['Ghaziabad', 'Lucknow', 'Noida']);
  assert.deepEqual((await search({ city: '  gHaZiAbAd ', state: ' uTtAr PrAdEsH ' })).map((office) => office.city), Array(4).fill('Ghaziabad'));
  assert.deepEqual(await search({ city: 'Mumbai', state: 'Uttar Pradesh' }), []);
  assert.deepEqual(await search({ city: 'Unknown City', state: 'Unknown State' }), []);
  assert.equal((await search({})).length, 32);
});

test('database results fall back to the complete curated city when the database is partial', async () => {
  const { search } = makeSearch({ offices: [OFFICE_RECORDS[0]], fallbackOffices: OFFICE_RECORDS });
  const results = await search({ city: 'Ghaziabad' });
  assert.equal(results.length, 4);
  assert.equal(new Set(results.map(({ id }) => id)).size, 4);
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
  assert.deepEqual((await search({ city: 'mUmBaI' })).map((office) => office.city), ['Mumbai', 'Mumbai', 'Mumbai', 'Mumbai']);
  assert.deepEqual([...new Set((await search({ state: ' uTtAr PrAdEsH ' })).map((office) => office.city))].sort(), ['Ghaziabad', 'Lucknow', 'Noida']);
  assert.deepEqual((await search({ city: 'Noida', state: 'Delhi' })), []);
  assert.deepEqual((await search({ city: 'Unknown City' })), []);
  assert.deepEqual((await search({ city: 'Unknown City', state: 'Unknown State' })), []);
  assert.equal((await search({})).length, 32);
});

test('every curated city has the expected state', () => {
  const expectedStates = {
    Ghaziabad: 'Uttar Pradesh', Delhi: 'Delhi', Mumbai: 'Maharashtra', Kolkata: 'West Bengal',
    Chennai: 'Tamil Nadu', Lucknow: 'Uttar Pradesh', Bengaluru: 'Karnataka', Noida: 'Uttar Pradesh'
  };
  assert.deepEqual(new Set(OFFICE_RECORDS.map(({ city }) => city)), new Set(Object.keys(expectedStates)));
  for (const office of OFFICE_RECORDS) assert.equal(office.state, expectedStates[office.city], office.city);
});

test('All Services returns four distinct offices per city and eight per service category', async () => {
  const { search } = makeSearch({ offices: OFFICE_RECORDS });
  assert.equal(OFFICE_RECORDS.length, 32);
  const ghaziabadAll = await search({ city: 'Ghaziabad', state: 'Uttar Pradesh' });
  assert.equal(ghaziabadAll.length, 4);
  assert.deepEqual([...new Set(ghaziabadAll.map(({ city }) => city))], ['Ghaziabad']);
  assert.equal((await search({})).length, 32, 'unfiltered development query includes all curated offices');
  for (const { city } of OFFICE_RECORDS) {
    const results = await search({ city });
    assert.equal(results.length, 4, `${city} All Services`);
    assert.equal(new Set(results.map(({ name }) => name)).size, 4, `${city} offices stay separate`);
  }
  for (const [serviceKey, serviceId] of Object.entries(SERVICE_IDS)) {
    let total = 0;
    for (const city of new Set(OFFICE_RECORDS.map(({ city }) => city))) {
      const results = await search({ city, serviceId });
      assert.equal(results.length, 1, `${city}/${serviceKey}`);
      total += results.length;
    }
    assert.equal(total, 8, `${serviceKey} directory links`);
  }
});

test('city and service filters compose and return the single category-linked office', async () => {
  const fallbackSearch = createOfficeSearch({ db: null, dbConnected: false, fallbackOffices: OFFICE_RECORDS, environment: 'development' });
  for (const city of new Set(OFFICE_RECORDS.map(({ city }) => city))) {
    const expectedState = OFFICE_RECORDS.find((office) => office.city === city).state;
    const allServices = await fallbackSearch({ city, state: expectedState });
    assert.equal(allServices.length, 4, `${city} All Services fallback`);
    assert.ok(allServices.every((office) => office.city === city && office.state === expectedState));
    for (const serviceId of Object.values(SERVICE_IDS)) {
      const results = await fallbackSearch({ city, serviceId });
      assert.equal(results.length, 1, `${city}/${serviceId}`);
      assert.equal(results[0].services[0].id, serviceId);
      assert.equal(results[0].services[0].verificationStatus, 'demo_assumed');
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

test('all four category filters match one distinct office in every target city', async () => {
  const { search } = makeSearch({ offices: OFFICE_RECORDS });
  const cities = [
    ['Ghaziabad', 'Uttar Pradesh'], ['Noida', 'Uttar Pradesh'], ['Delhi', 'Delhi'],
    ['Mumbai', 'Maharashtra'], ['Kolkata', 'West Bengal'], ['Chennai', 'Tamil Nadu'],
    ['Lucknow', 'Uttar Pradesh'], ['Bengaluru', 'Karnataka']
  ];
  for (const [city, state] of cities) {
    for (const [serviceKey, serviceId] of Object.entries(SERVICE_IDS)) {
      const result = await search({ city, state, serviceId });
      assert.equal(result.length, 1, `${city}/${state} ${serviceKey}`);
      assert.ok(result.every((office) => office.city === city && office.state === state));
    }
  }
  assert.equal(OFFICE_RECORDS.length, 32, 'catalogue retains all 32 offices');
});

test('city, state, and service filters compose; unknown service IDs return no offices', async () => {
  const { search } = makeSearch({ offices: OFFICE_RECORDS });
  const validServiceId = SERVICE_IDS.income;
  assert.deepEqual((await search({ city: 'ghaziabad', state: 'UTTAR PRADESH', serviceId: validServiceId })).map(({ city }) => city), ['Ghaziabad']);
  assert.deepEqual((await search({ city: 'lucknow', state: 'uTtAr PrAdEsH', serviceId: validServiceId })).map(({ city }) => city), ['Lucknow']);
  assert.equal((await search({ city: 'Mumbai', state: 'Maharashtra', serviceId: validServiceId })).length, 1);
  assert.deepEqual(await search({ city: 'Ghaziabad', serviceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }), []);
});

test('JSON fallback matches by service ID and excludes offices without that relationship', async () => {
  const search = createOfficeSearch({ db: null, dbConnected: false, fallbackOffices: OFFICE_RECORDS, environment: 'development' });
  const serviceId = SERVICE_IDS.income;
  const results = await search({ city: 'Ghaziabad', state: 'Uttar Pradesh', serviceId });
  assert.deepEqual(results.map(({ name }) => name), ['Tehsil Loni']);
  assert.equal(results[0].services[0].id, serviceId);
  assert.equal(results[0].services[0].name, 'Income Certificate');
  assert.equal((await search({ city: 'Ghaziabad', state: 'Uttar Pradesh', serviceId: SERVICE_IDS.birth })).length, 1);
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

test('radius filtering is consistent for All Services and every category in database and JSON fallback', async () => {
  const categorizedOffices = Object.values(SERVICE_IDS).flatMap((serviceId) => [
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
  for (const serviceId of Object.values(SERVICE_IDS)) {
    const filters = { ...allFilters, serviceId };
    const dbResults = await databaseSearch(filters);
    const fallbackResults = await fallbackSearch(filters);
    assert.deepEqual(dbResults.map(({ id }) => id), fallbackResults.map(({ id }) => id));
    assert.equal(dbResults.length, 1);
    assert.equal(dbResults[0].id, `near-${serviceId}`);
    assert.equal(dbResults[0].distanceKm, 0);
    assert.equal(dbResults.distanceUnavailableCount, 1);
  }
  assert.equal((await fallbackSearch({ city: 'Ghaziabad', serviceId: SERVICE_IDS.birth })).length, 3, 'missing radius leaves matching category results unrestricted');
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
  assert.equal(OFFICE_RECORDS.filter((office) => office.latitude === null && office.longitude === null).length, 28);
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
  assert.deepEqual(withinRadius.map(({ name }) => name), ['Tehsil Ghaziabad']);
  assert.ok(withinRadius[0].distanceKm <= 10);
  assert.equal(withinRadius.distanceUnavailableCount, 0);
  const withoutRadius = await search(filters);
  assert.deepEqual(withoutRadius.map(({ name }) => name), ['Tehsil Ghaziabad']);
  assert.ok(withoutRadius[0].distanceKm > 0);
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
  assert.equal(results.length, 4);
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
    assert.equal(body.data.length, 4);
    assert.ok(body.data.every((office) => office.city === 'Mumbai' && office.state === 'Maharashtra'));
    assert.ok(body.data.every((office) => office.sourceUrl));
    const radiusResponse = await fetch(`http://127.0.0.1:${port}/api/v1/offices?latitude=28.751620&longitude=77.499286&radiusKm=10`);
    const radiusBody = await radiusResponse.json();
    assert.equal(radiusBody.data.length, 1);
    assert.equal(radiusBody.data[0].name, 'Tehsil Ghaziabad');
    assert.match(radiusBody.message, /28 matching offices have no coordinates/);
    const serviceResponse = await fetch(`http://127.0.0.1:${port}/api/v1/offices?city=Ghaziabad&serviceId=${SERVICE_IDS.birth}`);
    const serviceBody = await serviceResponse.json();
    assert.equal(serviceBody.data.length, 1);
    assert.equal(serviceBody.data[0].services[0].id, SERVICE_IDS.birth);
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
});
