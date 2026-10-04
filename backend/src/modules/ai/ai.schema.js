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
