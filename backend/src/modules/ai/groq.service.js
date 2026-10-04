import Groq from "groq-sdk";
import { aiConfig } from "../../config/ai.js";
import { SYSTEM_PROMPT, buildUserMessage } from "./gemini.service.js";

const NEEDS_HUMAN_TAG = "NEEDS_HUMAN";

function processResponse(rawText) {
  let text = (rawText || "").trim();
  let needsHuman = false;

  if (text.includes(NEEDS_HUMAN_TAG)) {
    needsHuman = true;
    text = text.replace(new RegExp(NEEDS_HUMAN_TAG, "g"), "").trim();
  }

  return {
    answer: text,
    needs_human: needsHuman,
    generation_status: "groq"
  };
}

export async function generateWithGroq(question, language, chunks) {
  if (!aiConfig.groq.apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const groq = new Groq({ apiKey: aiConfig.groq.apiKey });
  const userMessage = buildUserMessage(question, language, chunks);

  const response = await groq.chat.completions.create({
    model: aiConfig.groq.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage }
    ],
    temperature: 0.1
  });

  const rawText = response.choices?.[0]?.message?.content || "";
  if (!rawText) {
    throw new Error("Groq returned empty response.");
  }

  return processResponse(rawText);
}
