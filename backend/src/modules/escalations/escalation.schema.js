import { z } from 'zod';

export const createEscalationSchema = z.object({
  conversationId: z.string().uuid('Invalid conversation ID format').nullable().optional(),
  subject: z.string({ required_error: 'Subject is required' }).min(1, 'Subject cannot be empty').max(200),
  description: z.string({ required_error: 'Description is required' }).min(1, 'Description cannot be empty')
});

export const caseIdParamSchema = z.object({
  caseId: z.string().uuid('Invalid case ID format')
});

export const sendCaseMessageSchema = z.object({
  message: z.string({ required_error: 'Message is required' }).min(1, 'Message cannot be empty')
});
