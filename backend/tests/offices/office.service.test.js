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
      if (city && !office.city?.toLocaleLowerCase().includes(city.contains.toLocaleLowerCase())) return false;
      if (state && !office.state?.toLocaleLowerCase().includes(state.contains.toLocaleLowerCase())) return false;
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
    city: { contains: 'Delhi', mode: 'insensitive' },
    state: { contains: 'Delhi', mode: 'insensitive' },
    services: { some: { serviceId: 'svc-a' } }
  });
  assert.equal(calls[0].include.services.include.service, true);
  assert.equal(result.sourceUrl, 'https://example.gov.in/office');
  assert.equal(result.services[0].name, 'Income Certificate');
  assert.equal(result.services[0].sourceUrl, 'https://example.gov.in/service');
  assert.equal(result.services[0].verificationStatus, 'unknown');
});

test('database search supports city-only, state-only, combined, and unfiltered searches case-insensitively', async () => {
  const { search } = makeSearch({ offices: OFFICE_RECORDS });
  assert.deepEqual((await search({ city: 'mUmBaI' })).map((office) => office.city), ['Mumbai']);
  assert.deepEqual([...new Set((await search({ state: 'uTtAr PrAdEsH' })).map((office) => office.city))].sort(), ['Ghaziabad', 'Lucknow', 'Noida']);
  assert.deepEqual(await search({ city: 'Mumbai', state: 'Uttar Pradesh' }), []);
  assert.deepEqual(await search({ state: 'Unknown State' }), []);
  assert.equal((await search({})).length, OFFICE_RECORDS.length);
});

test('JSON fallback uses the same city and state filters and returns no unrelated offices for unknown locations', async () => {
  const search = createOfficeSearch({ db: null, dbConnected: false, fallbackOffices: OFFICE_RECORDS, environment: 'development' });
  assert.deepEqual((await search({ city: 'mUmBaI' })).map((office) => office.city), ['Mumbai']);
  assert.deepEqual([...new Set((await search({ state: 'uTtAr PrAdEsH' })).map((office) => office.city))].sort(), ['Ghaziabad', 'Lucknow', 'Noida']);
  assert.deepEqual((await search({ city: 'Noida', state: 'Delhi' })), []);
  assert.deepEqual((await search({ city: 'Unknown City' })), []);
  assert.deepEqual((await search({ state: 'Unknown State' })), []);
  assert.equal((await search({})).length, OFFICE_RECORDS.length);
});

test('every curated city has the expected state', () => {
  const expectedStates = {
    Ghaziabad: 'Uttar Pradesh', Delhi: 'Delhi', Mumbai: 'Maharashtra', Kolkata: 'West Bengal',
    Chennai: 'Tamil Nadu', Lucknow: 'Uttar Pradesh', Bengaluru: 'Karnataka', Noida: 'Uttar Pradesh'
  };
  assert.deepEqual(new Set(OFFICE_RECORDS.map(({ city }) => city)), new Set(Object.keys(expectedStates)));
  for (const office of OFFICE_RECORDS) assert.equal(office.state, expectedStates[office.city], office.city);
});

test('existing service IDs match curated links and exclude offices without evidence-backed relationships', async () => {
  const { search } = makeSearch({ offices: OFFICE_RECORDS });
  for (const [serviceKey, serviceId] of Object.entries(SERVICE_IDS)) {
    const results = await search({ serviceId });
    if (serviceKey === 'birth') {
      assert.deepEqual(results, []);
      continue;
    }
    const expected = [{ name: 'Jan Suvidha Kendra, Tehsil Ghaziabad', city: 'Ghaziabad' }];
    if (serviceKey === 'income') expected.push({ name: 'Lucknow Collectorate', city: 'Lucknow' });
    assert.deepEqual(results.map(({ name, city }) => ({ name, city })), expected);
    const relationship = results[0].services.find(({ id }) => id === serviceId);
    assert.ok(relationship);
    assert.equal(relationship.name, `${serviceKey[0].toUpperCase()}${serviceKey.slice(1)} Certificate`);
    if (results[1]?.city === 'Lucknow') {
      const assumed = results[1].services.find(({ id }) => id === serviceId);
      assert.equal(assumed.verificationStatus, 'demo_assumed');
    }
  }
  assert.equal((await search({})).length, OFFICE_RECORDS.length);
});

test('one office can match multiple linked services while unrelated services stay excluded', async () => {
  const fallbackSearch = createOfficeSearch({ db: null, dbConnected: false, fallbackOffices: OFFICE_RECORDS, environment: 'development' });
  const incomeResults = await fallbackSearch({ city: 'Lucknow', state: 'Uttar Pradesh', serviceId: SERVICE_IDS.income });
  assert.deepEqual(incomeResults.map(({ name }) => name), ['Lucknow Collectorate']);
  assert.ok(incomeResults[0].services.some((service) => service.id === SERVICE_IDS.income && service.verificationStatus === 'demo_assumed'));
  for (const serviceId of [SERVICE_IDS.caste, SERVICE_IDS.domicile, SERVICE_IDS.birth]) {
    assert.deepEqual(await fallbackSearch({ city: 'Lucknow', state: 'Uttar Pradesh', serviceId }), []);
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

test('service mappings stay jurisdiction and office-specific across all eight cities', async () => {
  const { search } = makeSearch({ offices: OFFICE_RECORDS });
  const supported = new Set([
    'Ghaziabad:income', 'Ghaziabad:caste', 'Ghaziabad:domicile', 'Lucknow:income'
  ]);
  const cities = [
    ['Ghaziabad', 'Uttar Pradesh'], ['Noida', 'Uttar Pradesh'], ['Delhi', 'Delhi'],
    ['Mumbai', 'Maharashtra'], ['Kolkata', 'West Bengal'], ['Chennai', 'Tamil Nadu'],
    ['Lucknow', 'Uttar Pradesh'], ['Bengaluru', 'Karnataka']
  ];
  for (const [city, state] of cities) {
    for (const [serviceKey, serviceId] of Object.entries(SERVICE_IDS)) {
      const result = await search({ city, state, serviceId });
      const shouldMatch = supported.has(`${city}:${serviceKey}`);
      assert.equal(result.length > 0, shouldMatch, `${city}/${state} ${serviceKey}`);
      if (shouldMatch) assert.ok(result.every((office) => office.city === city && office.state === state));
    }
  }
  assert.equal((await search({})).length, OFFICE_RECORDS.length, 'all-services search still returns all curated offices');
});

test('city, state, and service filters compose; unknown service IDs return no offices', async () => {
  const { search } = makeSearch({ offices: OFFICE_RECORDS });
  const validServiceId = SERVICE_IDS.income;
  assert.deepEqual((await search({ city: 'ghaziabad', state: 'UTTAR PRADESH', serviceId: validServiceId })).map(({ city }) => city), ['Ghaziabad']);
  assert.deepEqual((await search({ city: 'lucknow', state: 'uTtAr PrAdEsH', serviceId: validServiceId })).map(({ city }) => city), ['Lucknow']);
  assert.deepEqual(await search({ city: 'Mumbai', state: 'Maharashtra', serviceId: validServiceId }), []);
  assert.deepEqual(await search({ serviceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }), []);
});

test('JSON fallback matches by service ID and excludes offices without that relationship', async () => {
  const search = createOfficeSearch({ db: null, dbConnected: false, fallbackOffices: OFFICE_RECORDS, environment: 'development' });
  const serviceId = SERVICE_IDS.income;
  const results = await search({ city: 'Ghaziabad', state: 'Uttar Pradesh', serviceId });
  assert.deepEqual(results.map(({ name }) => name), ['Jan Suvidha Kendra, Tehsil Ghaziabad']);
  assert.equal(results[0].services[0].id, serviceId);
  assert.equal(results[0].services[0].name, 'Income Certificate');
  assert.deepEqual(await search({ city: 'Ghaziabad', state: 'Uttar Pradesh', serviceId: SERVICE_IDS.birth }), []);
});

test('calculates valid Haversine distance and rejects invalid coordinates', () => {
  assert.equal(calculateHaversineDistance(0, 0, 0, 1), 111.19492664455873);
  assert.equal(calculateHaversineDistance(91, 0, 0, 0), null);
  assert.equal(calculateHaversineDistance(0, 0, null, null), null);
});

test('sorts calculable distances first and leaves unknown locations afterward', async () => {
  const { search } = makeSearch();
  const results = await search({ latitude: 28.6, longitude: 77.2 });
  assert.deepEqual(results.map((office) => office.id), ['near', 'far', 'unknown']);
  assert.equal(results[2].distanceKm, undefined);
});

test('radius excludes offices whose distance cannot be established', async () => {
  const { search } = makeSearch();
  const results = await search({ latitude: 28.6, longitude: 77.2, radiusKm: 3 });
  assert.deepEqual(results.map((office) => office.id), ['near']);
  assert.ok(results.every((office) => office.distanceKm <= 3));
  assert.equal(results.some((office) => office.id === 'unknown'), false);
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

test('Ghaziabad GPS search returns zero within radius when curated offices lack coordinates, then finds the office without radius', async () => {
  assert.ok(OFFICE_RECORDS.every((office) => office.latitude === null && office.longitude === null));
  const search = createOfficeSearch({
    db: null,
    dbConnected: false,
    fallbackOffices: OFFICE_RECORDS,
    environment: 'development'
  });
  const filters = {
    city: 'Ghaziabad', state: 'Uttar Pradesh', serviceId: SERVICE_IDS.income,
    latitude: 28.751620, longitude: 77.499286
  };
  assert.deepEqual(await search({ ...filters, radiusKm: 10 }), []);
  const withoutRadius = await search(filters);
  assert.deepEqual(withoutRadius.map(({ name }) => name), ['Jan Suvidha Kendra, Tehsil Ghaziabad']);
  assert.equal(withoutRadius[0].distanceKm, undefined);
});

test('handles absent office coordinates and does not invent working hours', async () => {
  const { search } = makeSearch();
  const unknown = (await search({ city: 'Delhi' })).find((office) => office.id === 'unknown');
  assert.equal(unknown.latitude, null);
  assert.equal(unknown.longitude, null);
  assert.equal(unknown.workingHours, null);
});

test('uses curated fallback for an empty database result only outside production', async () => {
  const { search } = makeSearch({ offices: [], fallbackOffices: sampleOffices });
  assert.equal((await search({})).length, sampleOffices.length);
  const production = makeSearch({ offices: [], fallbackOffices: sampleOffices, environment: 'production' });
  assert.deepEqual(await production.search({}), []);
});

test('reproduces empty database result for Mumbai and returns the curated record in development', async () => {
  const { search, calls } = makeSearch({ offices: [], fallbackOffices: OFFICE_RECORDS, environment: 'development' });
  const results = await search({ city: 'mUmBaI', state: 'maharashtra' });
  assert.deepEqual(results.map(({ city, state }) => ({ city, state })), [{ city: 'Mumbai', state: 'Maharashtra' }]);
  assert.deepEqual(calls[0].where, {
    city: { contains: 'mUmBaI', mode: 'insensitive' },
    state: { contains: 'maharashtra', mode: 'insensitive' }
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
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].city, 'Mumbai');
    assert.equal(body.data[0].state, 'Maharashtra');
    assert.ok(body.data[0].sourceUrl);
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
  await assert.rejects(search({}), failure);
  assert.equal(errors.length, 1);
});

test('uses in-memory fallback only outside production when the database query fails', async () => {
  const fallback = [{ id: 'fallback', name: 'Fallback', city: 'Delhi', state: 'Delhi' }];
  const { search } = makeSearch({ error: new Error('offline'), fallbackOffices: fallback });
  assert.deepEqual((await search({})).map(({ id }) => id), ['fallback']);
  const production = makeSearch({ error: new Error('offline'), fallbackOffices: fallback, environment: 'production' });
  await assert.rejects(production.search({}), /offline/);
});

test('uses in-memory fallback when the database is disconnected outside production', async () => {
  const fallback = [{ id: 'fallback', name: 'Fallback', city: 'Delhi', state: 'Delhi' }];
  const search = createOfficeSearch({ db: null, dbConnected: false, fallbackOffices: fallback, environment: 'development' });
  assert.deepEqual((await search({})).map(({ id }) => id), ['fallback']);
});

test('requires paired GPS coordinates and requires GPS coordinates for radius', () => {
  assert.equal(officeQuerySchema.safeParse({ radiusKm: '5' }).success, false);
  assert.equal(officeQuerySchema.safeParse({ latitude: '28.6' }).success, false);
  assert.equal(officeQuerySchema.safeParse({ latitude: '28.6', longitude: '77.2', radiusKm: '5' }).success, true);
});
