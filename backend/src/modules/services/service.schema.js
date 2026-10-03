import { z } from 'zod';

export const serviceQuerySchema = z.object({
  q: z.string().optional(),
  department: z.string().optional(),
  region: z.string().optional(),
  page: z.preprocess((val) => (val !== undefined ? parseInt(val, 10) : 1), z.number().int().min(1).default(1)),
  limit: z.preprocess((val) => (val !== undefined ? parseInt(val, 10) : 10), z.number().int().min(1).max(100).default(10))
});

export const serviceIdParamSchema = z.object({
  serviceId: z.string().uuid('Invalid service ID format')
});
