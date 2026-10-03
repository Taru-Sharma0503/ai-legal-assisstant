import { prisma, isDbConnected } from '../../config/db.js';

export const INITIAL_OFFICES = [
  {
    id: 'off-001-ghaziabad',
    name: 'Tehsil Office',
    address: 'Collectorate Compound, Raj Nagar',
    city: 'Ghaziabad',
    state: 'Uttar Pradesh',
    pincode: '201001',
    latitude: 28.67,
    longitude: 77.43,
    phone: '0120-2828281',
    workingHours: '10:00-17:00',
    serviceIds: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 'c3d4e5f6-a7b8-9012-cdef-123456789012']
  },
  {
    id: 'off-002-noida',
    name: 'SDM Office & Citizen Facilitation Centre',
    address: 'Sector 27, Pocket A',
    city: 'Noida',
    state: 'Uttar Pradesh',
    pincode: '201301',
    latitude: 28.53,
    longitude: 77.39,
    phone: '0120-2525251',
    workingHours: '09:30-17:30',
    serviceIds: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'b2c3d4e5-f6a7-8901-bcde-f12345678901']
  },
  {
    id: 'off-003-delhi',
    name: 'Sub-Divisional Magistrate Office (Central)',
    address: '14 Daryaganj, Old Employment Exchange Building',
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '110002',
    latitude: 28.64,
    longitude: 77.24,
    phone: '011-23275141',
    workingHours: '10:00-17:00',
    serviceIds: ['d4e5f6a7-b8c9-0123-def1-234567890123']
  }
];

export const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const searchOffices = async ({ serviceId, city, state, latitude, longitude, radiusKm }) => {
  let dbOffices = [];

  if (prisma && isDbConnected) {
    try {
      const where = {
        ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
        ...(state ? { state: { contains: state, mode: 'insensitive' } } : {}),
        ...(serviceId ? { services: { some: { serviceId } } } : {})
      };
      dbOffices = await prisma.office.findMany({ where });
    } catch (err) {
      // fallback
    }
  }

  const officesList = dbOffices.length > 0 ? dbOffices : INITIAL_OFFICES.filter(o => {
    if (city && !o.city.toLowerCase().includes(city.toLowerCase())) return false;
    if (state && !o.state.toLowerCase().includes(state.toLowerCase())) return false;
    if (serviceId && o.serviceIds && !o.serviceIds.includes(serviceId)) return false;
    return true;
  });

  const results = officesList.map(office => {
    let distanceKm = null;
    if (latitude !== undefined && longitude !== undefined) {
      const dist = calculateHaversineDistance(latitude, longitude, office.latitude, office.longitude);
      distanceKm = Number(dist.toFixed(1));
    }

    return {
      id: office.id,
      name: office.name,
      address: office.address,
      city: office.city,
      state: office.state,
      pincode: office.pincode,
      latitude: office.latitude,
      longitude: office.longitude,
      phone: office.phone || '',
      workingHours: office.workingHours || '10:00-17:00',
      ...(distanceKm !== null ? { distanceKm } : {})
    };
  });

  if (latitude !== undefined && longitude !== undefined) {
    let filtered = results;
    if (radiusKm !== undefined) {
      filtered = filtered.filter(o => o.distanceKm <= radiusKm);
    }
    filtered.sort((a, b) => a.distanceKm - b.distanceKm);
    return filtered;
  }

  return results;
};
