
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
    'REJECTED'
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
