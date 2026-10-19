import { z } from 'zod';

const optionalNumber = (value) => value !== undefined && value !== '' ? Number(value) : undefined;
const optionalText = (value) => typeof value === 'string' ? value.trim() || undefined : value;

export const officeQuerySchema = z.object({
  serviceId: z.string().uuid('Invalid service ID format').optional(),
  city: z.preprocess(optionalText, z.string().optional()),
  state: z.preprocess(optionalText, z.string().optional()),
  latitude: z.preprocess(optionalNumber, z.number().finite().min(-90).max(90).optional()),
  longitude: z.preprocess(optionalNumber, z.number().finite().min(-180).max(180).optional()),
  radiusKm: z.preprocess(optionalNumber, z.number().finite().positive().optional())
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
