import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDemoLocation,
  buildOfficeSearchParams,
  getDemoLocation
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

test('successful geolocation populates real coordinates and demo city/state without changing service or radius', async () => {
  const geolocation = mockGeolocation();
  const coords = await getDemoLocation(geolocation);
  assert.deepEqual(geolocation.calls, [{ timeout: 10000, enableHighAccuracy: false }]);

  const existingForm = {
    serviceId: 'income-service', city: '', state: '', latitude: '', longitude: '', radiusKm: '25'
  };
  const populated = applyDemoLocation(existingForm, coords);
  assert.deepEqual(populated, {
    serviceId: 'income-service', city: 'Ghaziabad', state: 'Uttar Pradesh',
    latitude: '37.774900', longitude: '-122.419400', radiusKm: '25'
  });
  assert.deepEqual(existingForm, {
    serviceId: 'income-service', city: '', state: '', latitude: '', longitude: '', radiusKm: '25'
  });
});

test('permission denial is explained and failed geolocation does not produce coordinates or demo defaults', async () => {
  const form = { serviceId: 'income-service', city: '', state: '', latitude: '', longitude: '', radiusKm: '10' };
  await assert.rejects(getDemoLocation(mockGeolocation({ code: 1 })), /Location access was denied/);
  assert.deepEqual(form, { serviceId: 'income-service', city: '', state: '', latitude: '', longitude: '', radiusKm: '10' });
});

test('unavailable, timeout, unsupported, and invalid geolocation are handled without fake values', async () => {
  await assert.rejects(getDemoLocation(mockGeolocation({ code: 2 })), /location is unavailable/i);
  await assert.rejects(getDemoLocation(mockGeolocation({ code: 3 })), /timed out/i);
  await assert.rejects(getDemoLocation(null), /not supported/i);
  await assert.rejects(getDemoLocation(mockGeolocation(null, { latitude: NaN, longitude: 1 })), /valid location coordinates/i);
});

test('subsequent search uses coordinates, demo location filters, selected service, and radius', () => {
  const params = buildOfficeSearchParams({
    serviceId: 'income-service', city: 'Ghaziabad', state: 'Uttar Pradesh',
    latitude: '37.774900', longitude: '-122.419400', radiusKm: '25'
  });
  assert.deepEqual(params, {
    serviceId: 'income-service', city: 'Ghaziabad', state: 'Uttar Pradesh',
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
