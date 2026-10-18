import { z } from 'zod';

export const officeQuerySchema = z.object({
  serviceId: z.string().uuid('Invalid service ID format').optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  latitude: z.preprocess((val) => (val !== undefined && val !== '' ? parseFloat(val) : undefined), z.number().min(-90).max(90).optional()),
  longitude: z.preprocess((val) => (val !== undefined && val !== '' ? parseFloat(val) : undefined), z.number().min(-180).max(180).optional()),
  radiusKm: z.preprocess((val) => (val !== undefined && val !== '' ? parseFloat(val) : undefined), z.number().positive().optional())
}).superRefine((query, context) => {
  const hasLatitude = query.latitude !== undefined;
  const hasLongitude = query.longitude !== undefined;
  if (hasLatitude !== hasLongitude) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Latitude and longitude must be provided together' });
  }
  if (query.radiusKm !== undefined && (!hasLatitude || !hasLongitude)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['radiusKm'], message: 'Radius requires GPS coordinates' });
  }
});
