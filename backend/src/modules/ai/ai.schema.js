import { z } from "zod";

export const askSchema = z.object({
  question: z.string().min(1, "Question is required"),
  state: z.string().default("Uttar Pradesh"),
  language: z.enum(["auto", "en", "hi", "hinglish"]).default("auto"),
  conversationHistory: z.array(z.any()).optional().default([])
});

export const askResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    answer: z.string(),
    needs_human: z.boolean(),
    generation_status: z.enum(["gemini", "groq", "fallback", "guardrail"]),
    confidence: z.number(),
    sources: z.array(z.any()),
    suggested_service_id: z.string().nullable(),
    language_used: z.string()
  })
});

export const createConversationSchema = z.object({
  language: z.enum(["auto", "en", "hi", "hinglish"]).optional().default("en"),
  title: z.string().optional()
});

export const conversationIdParamSchema = z.object({
  conversationId: z.string().uuid("conversationId must be a valid UUID")
});

export const postMessageSchema = z.object({
  question: z.string().optional(),
  message: z.string().optional(),
  language: z.enum(["auto", "en", "hi", "hinglish"]).optional()
}).transform((data, ctx) => {
  const q = data.question || data.message;
  if (!q || q.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Question or message is required"
    });
    return z.NEVER;
  }
  return {
    question: q,
    language: data.language
  };
});

