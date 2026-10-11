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

export const applicationDocParamsSchema = z.object({
  applicationId: z.string().uuid('Invalid application ID format'),
  documentId: z.string().min(1, 'Document ID is required')
});

export const updateApplicationSchema = z.object({
  serviceId: z.string().uuid('Invalid service ID format').optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN']).optional(),
  notes: z.string().optional()
});

export const updateDocumentSchema = z.object({
  name: z.string().min(1, 'Document name cannot be empty').max(200).optional(),
  status: z.enum(['PENDING', 'UPLOADED', 'VERIFIED', 'REJECTED']).optional()
});
