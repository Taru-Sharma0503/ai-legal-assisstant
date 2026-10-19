
import { z } from 'zod';

const applicantDetailsSchema = z.object({
  fullName: z.string().trim().max(150).optional(),
  applicantName: z.string().trim().max(150).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().trim().max(50).optional(),
  mobile: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(254).optional().or(z.literal('')),
  address: z.string().trim().max(2000).optional(),
  annualIncome: z.union([
    z.number().finite().nonnegative(),
    z.string().trim().max(30),
    z.literal('')
  ]).optional(),
  occupation: z.string().trim().max(150).optional(),
  incomeSource: z.string().trim().max(150).optional()
}).optional();

export const createApplicationSchema = z.object({
  serviceId: z.string({
    required_error: 'Service ID is required'
  }).uuid('Invalid service ID format'),

  applicantDetails: applicantDetailsSchema
});

export const applicationQuerySchema = z.object({
  status: z.enum([
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'REJECTED',
    'WITHDRAWN'
  ]).optional(),

  page: z.preprocess(
    val => val !== undefined ? parseInt(val, 10) : 1,
    z.number().int().min(1).default(1)
  ),

  limit: z.preprocess(
    val => val !== undefined ? parseInt(val, 10) : 10,
    z.number().int().min(1).max(100).default(10)
  )
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
