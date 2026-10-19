const locationErrorMessage = (error) => {
  switch (error?.code) {
    case 1:
      return 'Location access was denied. Allow location access to use this feature.';
    case 2:
      return 'Your location is unavailable. Try again or enter a city manually.';
    case 3:
      return 'The location request timed out. Try again or enter a city manually.';
    default:
      return 'Could not get your location. Try again or enter a city manually.';
  }
};

export const getDemoLocation = (geolocation) => new Promise((resolve, reject) => {
  if (!geolocation?.getCurrentPosition) {
    reject(new Error('Geolocation is not supported by your browser.'));
    return;
  }

  geolocation.getCurrentPosition(
    ({ coords }) => {
      if (!Number.isFinite(coords?.latitude) || !Number.isFinite(coords?.longitude)) {
        reject(new Error('Could not get valid location coordinates. Try again or enter a city manually.'));
        return;
      }
      resolve({ latitude: coords.latitude, longitude: coords.longitude });
    },
    (error) => reject(new Error(locationErrorMessage(error))),
    { timeout: 10000, enableHighAccuracy: false }
  );
});

export const applyDemoLocation = (form, coords) => ({
  ...form,
  city: 'Ghaziabad',
  state: 'Uttar Pradesh',
  latitude: coords.latitude.toFixed(6),
  longitude: coords.longitude.toFixed(6)
});

export const buildOfficeSearchParams = (form, { withoutRadius = false } = {}) => {
  const params = {};
  ['serviceId', 'city', 'state', 'latitude', 'longitude'].forEach((key) => {
    if (form[key]) params[key] = form[key];
  });
  if (!withoutRadius && form.latitude && form.longitude && form.radiusKm) params.radiusKm = form.radiusKm;
  return params;
};
