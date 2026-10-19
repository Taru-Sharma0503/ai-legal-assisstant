import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyCoordinates,
  buildOfficeSearchParams,
  getCurrentLocation
} from '../../src/utils/officeLocation.js';

const mockGeolocation = (error = null, coords = { latitude: 37.7749, longitude: -122.4194 }) => {
  const calls = [];
  return {
    calls,
    getCurrentPosition: (success, failure, options) => {
      calls.push(options);
      if (error) failure(error);
      else success({ coords });
    }
  };
};

test('successful geolocation fills browser coordinates and Ghaziabad defaults while preserving service and radius', async () => {
  const geolocation = mockGeolocation();
  const coords = await getCurrentLocation(geolocation);
  assert.deepEqual(geolocation.calls, [{ timeout: 10000, enableHighAccuracy: false }]);

  const existingForm = {
    serviceId: 'income-service', city: '', state: '', latitude: '', longitude: '', radiusKm: '25'
  };
  const populated = applyCoordinates(existingForm, coords);
  assert.deepEqual(populated, {
    serviceId: 'income-service', city: 'Ghaziabad', state: 'Uttar Pradesh',
    latitude: '37.774900', longitude: '-122.419400', radiusKm: '25'
  });
  assert.deepEqual(existingForm, {
    serviceId: 'income-service', city: '', state: '', latitude: '', longitude: '', radiusKm: '25'
  });
});

test('location defaults produce a Ghaziabad search with actual coordinates and the selected service', async () => {
  const coords = await getCurrentLocation(mockGeolocation(null, { latitude: 28.67, longitude: 77.43 }));
  const form = applyCoordinates({ serviceId: 'birth-service', city: '', state: '', radiusKm: '' }, coords);
  assert.deepEqual(buildOfficeSearchParams(form), {
    serviceId: 'birth-service', city: 'Ghaziabad', state: 'Uttar Pradesh',
    latitude: '28.670000', longitude: '77.430000'
  });
});

test('Find Offices UI has no user-facing demo location wording', () => {
  const source = readFileSync(new URL('../../src/pages/Offices.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /demo\s+(mode|location|default|behavior)/i);
});

test('permission denial is explained and failed geolocation does not produce coordinates', async () => {
  const form = { serviceId: 'income-service', city: '', state: '', latitude: '', longitude: '', radiusKm: '10' };
  await assert.rejects(getCurrentLocation(mockGeolocation({ code: 1 })), /Location access was denied/);
  assert.deepEqual(form, { serviceId: 'income-service', city: '', state: '', latitude: '', longitude: '', radiusKm: '10' });
});

test('unavailable, timeout, unsupported, and invalid geolocation are handled without fake values', async () => {
  await assert.rejects(getCurrentLocation(mockGeolocation({ code: 2 })), /location is unavailable/i);
  await assert.rejects(getCurrentLocation(mockGeolocation({ code: 3 })), /timed out/i);
  await assert.rejects(getCurrentLocation(null), /not supported/i);
  await assert.rejects(getCurrentLocation(mockGeolocation(null, { latitude: NaN, longitude: 1 })), /valid location coordinates/i);
});

test('subsequent search uses coordinates, keeps blank city/state, selected service, and radius', () => {
  const params = buildOfficeSearchParams({
    serviceId: 'income-service', city: '', state: '',
    latitude: '37.774900', longitude: '-122.419400', radiusKm: '25'
  });
  assert.deepEqual(params, {
    serviceId: 'income-service',
    latitude: '37.774900', longitude: '-122.419400', radiusKm: '25'
  });
});

test('search without radius preserves GPS, city, state, and service filters while omitting radius', () => {
  const params = buildOfficeSearchParams({
    serviceId: 'income-service', city: 'Ghaziabad', state: 'Uttar Pradesh',
    latitude: '28.751620', longitude: '77.499286', radiusKm: '10'
  }, { withoutRadius: true });
  assert.deepEqual(params, {
    serviceId: 'income-service', city: 'Ghaziabad', state: 'Uttar Pradesh',
    latitude: '28.751620', longitude: '77.499286'
  });
});

test('All Services omits serviceId and ordinary directory searches do not silently add a radius', () => {
  assert.deepEqual(buildOfficeSearchParams({
    serviceId: '', city: 'Ghaziabad', state: 'Uttar Pradesh', latitude: '', longitude: '', radiusKm: ''
  }), { city: 'Ghaziabad', state: 'Uttar Pradesh' });
});

test('a user-supplied radius is not silently dropped when GPS coordinates are missing', () => {
  assert.deepEqual(buildOfficeSearchParams({
    serviceId: 'income-service', city: 'Ghaziabad', state: 'Uttar Pradesh',
    latitude: '', longitude: '', radiusKm: '10'
  }), { serviceId: 'income-service', city: 'Ghaziabad', state: 'Uttar Pradesh', radiusKm: '10' });
});

test('empty radius is omitted while city/state and service filters remain active', () => {
  assert.deepEqual(buildOfficeSearchParams({
    serviceId: 'svc', city: '  Noida ', state: ' Uttar Pradesh ', latitude: '', longitude: '', radiusKm: '  '
  }), { serviceId: 'svc', city: 'Noida', state: 'Uttar Pradesh' });
});
