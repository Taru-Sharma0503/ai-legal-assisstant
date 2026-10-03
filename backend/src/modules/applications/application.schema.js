import { z } from 'zod';

export const createApplicationSchema = z.object({
  serviceId: z.string({ required_error: 'Service ID is required' }).uuid('Invalid service ID format')
});

export const applicationQuerySchema = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED']).optional(),
  page: z.preprocess((val) => (val !== undefined ? parseInt(val, 10) : 1), z.number().int().min(1).default(1)),
  limit: z.preprocess((val) => (val !== undefined ? parseInt(val, 10) : 10), z.number().int().min(1).max(100).default(10))
});

export const applicationIdParamSchema = z.object({
  applicationId: z.string().uuid('Invalid application ID format')
});
