import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICE_RECORDS,
  assertNonProductionDatabase,
  buildOfficeSeedPlan,
  seedOfficeRecords,
  validateOfficeRecords
} from '../../src/utils/officeSeed.js';
import targetCities from '../../data/offices/target-cities.json' with { type: 'json' };

const serviceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const catalogueServiceIds = [
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  'c3d4e5f6-a7b8-9012-cdef-123456789012',
  'd4e5f6a7-b8c9-0123-def1-234567890123'
];
const baseOffice = {
  ...OFFICE_RECORDS[0],
  services: [{
    serviceId,
    sourceName: 'Official certificate authority listing',
    sourceUrl: 'https://example.gov.in/offices',
    verifiedAt: '2026-10-18T00:00:00.000Z'
  }]
};

test('validates office records, PIN codes, coordinates, sources, service IDs, and seed keys', () => {
  assert.deepEqual(validateOfficeRecords([baseOffice], [serviceId]), []);
  const invalid = {
    ...baseOffice,
    pincode: '1234',
    latitude: 91,
    longitude: 77,
    sourceUrl: 'http://not-https.invalid',
    services: [{ ...baseOffice.services[0], serviceId: 'missing-service' }]
  };
  assert.ok(validateOfficeRecords([invalid], [serviceId]).length >= 4);
  assert.ok(validateOfficeRecords([baseOffice, baseOffice], [serviceId]).some((error) => error.includes('duplicated')));
  assert.ok(validateOfficeRecords([{ ...baseOffice, coordinateSource: 'OpenStreetMap Nominatim', coordinateSourceUrl: 'https://nominatim.openstreetmap.org/ui/search.html', latitude: 1, longitude: 2, coordinateApproximate: false }], [serviceId]).some((error) => error.includes('marked approximate')));
  assert.ok(validateOfficeRecords([{ ...baseOffice, verifiedAt: '2026-10-19' }], [serviceId]).some((error) => error.includes('verifiedAt')));
});

test('curated office data validates and target city list contains exactly the requested eight cities', () => {
  assert.deepEqual(validateOfficeRecords(OFFICE_RECORDS, catalogueServiceIds), []);
  assert.deepEqual(targetCities, ['Ghaziabad', 'Delhi', 'Mumbai', 'Kolkata', 'Chennai', 'Lucknow', 'Bengaluru', 'Noida']);
  const noida = OFFICE_RECORDS.find((office) => office.city === 'Noida');
  assert.equal(noida.address, null);
  assert.equal(noida.phone, '7618927846');
});

test('seed plan preserves existing offices and relationships', () => {
  const plan = buildOfficeSeedPlan([baseOffice], [{ id: 'office-db-id', seedKey: baseOffice.seedKey }], [
    { officeId: 'office-db-id', serviceId }
  ]);
  assert.equal(plan[0].action, 'preserve existing office');
  assert.equal(plan[0].services[0].action, 'preserve existing relationship');
});

test('dry run reports the plan without creating offices or relationships', async () => {
  let writes = 0;
  const db = {
    office: { findMany: async () => [], findUnique: async () => null, create: async () => { writes += 1; } },
    officeService: { findMany: async () => [], findUnique: async () => null, create: async () => { writes += 1; } },
    $transaction: async (callback) => callback(db)
  };
  const plan = await seedOfficeRecords({
    db,
    records: [baseOffice],
    allowedServiceIds: [serviceId],
    dryRun: true,
    databaseUrl: 'postgresql://localhost/legal_assistant',
    log: { info() {} }
  });
  assert.equal(plan[0].services[0].action, 'create relationship');
  assert.equal(writes, 0);
});

test('seed creates correct OfficeService links idempotently and preserves office values', async () => {
  const offices = [];
  const links = [];
  let nextId = 1;
  const db = {
    office: {
      findMany: async () => offices.map(({ id, seedKey }) => ({ id, seedKey })),
      findUnique: async ({ where }) => offices.find(({ seedKey }) => seedKey === where.seedKey) || null,
      create: async ({ data }) => {
        const created = { ...data, id: `office-${nextId++}` };
        offices.push(created);
        return created;
      }
    },
    officeService: {
      findMany: async () => links.map(({ officeId, serviceId: linkedId }) => ({ officeId, serviceId: linkedId })),
      findUnique: async ({ where }) => links.find((link) => link.officeId === where.officeId_serviceId.officeId && link.serviceId === where.officeId_serviceId.serviceId) || null,
      create: async ({ data }) => {
        const created = { ...data, id: `link-${nextId++}` };
        links.push(created);
        return created;
      },
      update: async () => { throw new Error('No update expected for a verified existing link'); }
    },
    $transaction: async (callback) => callback(db)
  };
  const args = { db, records: [baseOffice], allowedServiceIds: [serviceId], databaseUrl: 'postgresql://127.0.0.1/legal_assistant', log: { info() {} } };
  await seedOfficeRecords(args);
  const originalOffice = { ...offices[0] };
  await seedOfficeRecords(args);

  assert.equal(offices.length, 1);
  assert.equal(links.length, 1);
  assert.equal(links[0].serviceId, serviceId);
  assert.equal(links[0].sourceUrl, baseOffice.services[0].sourceUrl);
  assert.deepEqual(offices[0], originalOffice);
});

test('blocks production and remote database targets', () => {
  assert.throws(() => assertNonProductionDatabase({ databaseUrl: 'postgresql://localhost/prod', environment: 'development' }), /local non-production/);
  assert.throws(() => assertNonProductionDatabase({ databaseUrl: 'postgresql://db.example.com/legal', environment: 'development' }), /local non-production/);
  assert.throws(() => assertNonProductionDatabase({ databaseUrl: 'postgresql://localhost/legal', environment: 'production' }), /NODE_ENV=production/);
  assert.throws(() => assertNonProductionDatabase({ databaseUrl: 'postgresql://user:password@localhost/legal?application_name=production', environment: 'development' }), /local non-production/);
});

test('reuses an exact legacy office without a seedKey and refreshes an undated service link', async () => {
  const legacy = { id: 'legacy-office', seedKey: null, name: baseOffice.name, address: baseOffice.address, city: baseOffice.city, state: baseOffice.state };
  const offices = [legacy];
  const links = [{ id: 'link-1', officeId: legacy.id, serviceId, verifiedAt: null, sourceName: null, sourceUrl: null }];
  let officeCreates = 0;
  let linkUpdates = 0;
  const db = {
    office: {
      findMany: async ({ where }) => where?.seedKey ? [] : offices.filter((office) => office.city.toLowerCase() === where.city.equals.toLowerCase() && office.state.toLowerCase() === where.state.equals.toLowerCase()),
      findUnique: async () => null,
      create: async () => { officeCreates += 1; throw new Error('Should reuse legacy office'); }
    },
    officeService: {
      findMany: async () => links.map(({ officeId, serviceId: linkedId }) => ({ officeId, serviceId: linkedId })),
      findUnique: async () => links[0],
      create: async () => { throw new Error('Link already exists'); },
      update: async ({ data }) => { linkUpdates += 1; Object.assign(links[0], data); }
    },
    $transaction: async (callback) => callback(db)
  };
  const plan = await seedOfficeRecords({ db, records: [baseOffice], allowedServiceIds: [serviceId], databaseUrl: 'postgresql://localhost/legal_assistant', log: { info() {} } });
  assert.equal(plan[0].action, 'preserve existing office');
  assert.equal(plan[0].officeId, legacy.id);
  assert.equal(officeCreates, 0);
  assert.equal(linkUpdates, 1);
  assert.equal(links[0].sourceUrl, baseOffice.services[0].sourceUrl);
  links[0].verifiedAt = new Date('2026-10-20T00:00:00.000Z');
  links[0].sourceUrl = 'https://newer.gov.in/source';
  await seedOfficeRecords({ db, records: [baseOffice], allowedServiceIds: [serviceId], databaseUrl: 'postgresql://localhost/legal_assistant', log: { info() {} } });
  assert.equal(linkUpdates, 1);
  assert.equal(links[0].sourceUrl, 'https://newer.gov.in/source');
});
