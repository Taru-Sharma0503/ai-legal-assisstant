import { z } from 'zod';

export const updateCaseStatusSchema = z.object({
  status: z.enum(['PENDING', 'IN_REVIEW', 'RESPONDED', 'RESOLVED', 'CLOSED'], {
    required_error: 'Status is required'
  })
});

export const adminReplySchema = z.object({
  message: z.string({ required_error: 'Message is required' }).min(1, 'Message cannot be empty')
});

export const createServiceSchema = z.object({
  name: z.string({ required_error: 'Service name is required' }).min(1),
  department: z.string({ required_error: 'Department is required' }).min(1),
  description: z.string({ required_error: 'Description is required' }).min(1),
  eligibility: z.string().optional(),
  applicationMethod: z.enum(['ONLINE', 'OFFLINE', 'BOTH']).default('BOTH'),
  governmentPortalUrl: z.string().url().optional().or(z.literal('')),
  region: z.string({ required_error: 'Region is required' }).min(1),
  documents: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    mandatory: z.boolean().default(true)
  })).optional().default([])
});

export const updateServiceSchema = z.object({
  name: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  eligibility: z.string().optional(),
  applicationMethod: z.enum(['ONLINE', 'OFFLINE', 'BOTH']).optional(),
  governmentPortalUrl: z.string().url().optional().or(z.literal('')),
  region: z.string().min(1).optional(),
  isActive: z.boolean().optional()
});

export const adminCaseQuerySchema = z.object({
  status: z.enum(['PENDING', 'IN_REVIEW', 'RESPONDED', 'RESOLVED', 'CLOSED']).optional(),
  page: z.preprocess((val) => (val !== undefined ? parseInt(val, 10) : 1), z.number().int().min(1).default(1)),
  limit: z.preprocess((val) => (val !== undefined ? parseInt(val, 10) : 10), z.number().int().min(1).max(100).default(10))
});
