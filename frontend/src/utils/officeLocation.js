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

export const getCurrentLocation = (geolocation) => new Promise((resolve, reject) => {
  if (!geolocation?.getCurrentPosition) {
    reject(new Error('Geolocation is not supported by your browser.'));
    return;
  }

  geolocation.getCurrentPosition(
    ({ coords }) => {
      if (!Number.isFinite(coords?.latitude) || coords.latitude < -90 || coords.latitude > 90 ||
          !Number.isFinite(coords?.longitude) || coords.longitude < -180 || coords.longitude > 180) {
        reject(new Error('Could not get valid location coordinates. Try again or enter a city manually.'));
        return;
      }
      resolve({ latitude: coords.latitude, longitude: coords.longitude });
    },
    (error) => reject(new Error(locationErrorMessage(error))),
    { timeout: 10000, enableHighAccuracy: false }
  );
});

export const applyCoordinates = (form, coords) => ({
  ...form,
  city: 'Ghaziabad',
  state: 'Uttar Pradesh',
  latitude: coords.latitude.toFixed(6),
  longitude: coords.longitude.toFixed(6)
});

export const buildOfficeSearchParams = (form, { withoutRadius = false } = {}) => {
  const params = {};
  ['serviceId', 'city', 'state', 'latitude', 'longitude'].forEach((key) => {
    const value = typeof form[key] === 'string' ? form[key].trim() : form[key];
    if (value) params[key] = value;
  });
  const radius = typeof form.radiusKm === 'string' ? form.radiusKm.trim() : form.radiusKm;
  if (!withoutRadius && radius) params.radiusKm = radius;
  return params;
};
