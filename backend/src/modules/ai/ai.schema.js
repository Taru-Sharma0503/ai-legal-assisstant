import { z } from 'zod';

export const createConversationSchema = z.object({
  language: z.string({ required_error: 'Language is required' }).default('hi'),
  title: z.string().nullable().optional()
});

export const askAiSchema = z.object({
  message: z.string({ required_error: 'Message is required' }).min(1, 'Message cannot be empty'),
  language: z.string({ required_error: 'Language is required' })
});

export const conversationIdParamSchema = z.object({
  conversationId: z.string().uuid('Invalid conversation ID format')
});
