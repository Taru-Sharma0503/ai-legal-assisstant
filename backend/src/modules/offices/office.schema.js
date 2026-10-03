import { z } from 'zod';

export const officeQuerySchema = z.object({
  serviceId: z.string().uuid('Invalid service ID format').optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  latitude: z.preprocess((val) => (val !== undefined && val !== '' ? parseFloat(val) : undefined), z.number().min(-90).max(90).optional()),
  longitude: z.preprocess((val) => (val !== undefined && val !== '' ? parseFloat(val) : undefined), z.number().min(-180).max(180).optional()),
  radiusKm: z.preprocess((val) => (val !== undefined && val !== '' ? parseFloat(val) : undefined), z.number().positive().optional())
});
