import { aiClient, AI_CONFIG } from '../../config/ai.js';
import { logger } from '../../utils/logger.js';

/**
 * Builds structured response using Google GenAI or intelligent fallback
 */
export const generateGroundedResponse = async ({
  query,
  language,
  retrievedChunks,
  suggestedService = null
}) => {
  const contextString = retrievedChunks
    .map((chunk, index) => `[Source ${index + 1} - ${chunk.title} (${chunk.department})]\n${chunk.content}`)
    .join('\n\n');

      // No verified source matched: don't let Gemini guess, hand off to a human
  if (retrievedChunks.length === 0) {
    return generateFallbackResponse({ query, language, retrievedChunks, suggestedService });
  }

  const prompt = `You are an AI Citizen Legal Assistant.
Language requested: ${language}

Retrieved Verified Sources:
${contextString || 'No specific sources found in the database.'}

Suggested Service Identified:
${suggestedService ? `${suggestedService.name} (ID: ${suggestedService.id})` : 'None'}

User Question:
"${query.replace(/"/g, '\\"')}"

INSTRUCTIONS:
1. Provide a comprehensive, clear, and empathetic answer strictly in the requested language (${language}).
2. Include all necessary details from verified sources: eligibility, documents needed, fees, processing times, and steps.
3. Calculate a confidence score between 0.00 and 1.00 based on how well the verified sources answer the query.
4. If confidence is below 0.65 or if the user is asking about an intractable court dispute, property litigation, criminal matter, or human intervention, set needsHuman to true. Otherwise false.
5. Return ONLY a valid JSON object strictly matching this format without any markdown or code blocks:
{
  "answer": "...",
  "confidence": 0.91,
  "needsHuman": false
}`;

  if (aiClient) {
    try {
      const response = await aiClient.models.generateContent({
        model: AI_CONFIG.model,
        contents: prompt,
        config: {
          temperature: AI_CONFIG.temperature,
          topP: AI_CONFIG.topP,
          systemInstruction: AI_CONFIG.systemInstruction
        }
      });

      let text = response.text || '';
      // Clean possible markdown code fences
      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

      const parsed = JSON.parse(text);
      return {
        answer: parsed.answer || text,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
        needsHuman: Boolean(parsed.needsHuman)
      };
    } catch (err) {
      logger.warn(`[Gemini API] Failed call: ${err.message}. Using high-quality grounded fallback.`);
    }
  }

const NEEDS_HUMAN_TAG = "NEEDS_HUMAN";

export const SYSTEM_PROMPT = `
You are a trusted government-service assistant for Indian citizens.
You help people understand government services in Uttar Pradesh.

STRICT RULES:

1. Answer ONLY from the verified context passages provided below.

2. Do NOT invent, assume, or guess any fee amount, document name,
   timeline, eligibility criterion, processing step, or office location.

3. If the context does not contain enough information to answer,
   clearly state what is unknown and indicate that the user should
   contact a human officer.

4. When listing documents, use a bullet-point checklist.

5. Keep answers short, clear, and factual.

6. Reply strictly in the language/style requested:
   - "en" = English. The final answer MUST be strictly in English. Do NOT output Hindi words or Devanagari text.
   - "hi" = Hindi. The final answer MUST be strictly in Hindi using Devanagari script.
   - "hinglish" = Hinglish. The final answer MUST be strictly in natural Hinglish using Roman/Latin script. Do NOT use Devanagari script.

7. For Hinglish, use natural conversational Roman Hindi mixed with English.
   Do NOT convert Hinglish into Devanagari Hindi.

8. Keep official service names and terms such as Domicile Certificate,
   Income Certificate, Caste Certificate, Aadhaar, and eDistrict unchanged
   where appropriate.

9. You may translate or rephrase verified information into the requested
   language/style, but MUST NOT add information absent from the context.

10. Do not combine information from different government services unless
    the user explicitly asks for a comparison.

11. Never say "Based on the context" or "According to the retrieved context".
    Answer directly.
`;

export const USER_TEMPLATE = `
Requested Language: {language_label}

--- VERIFIED CONTEXT ---

{context_block}

--- END CONTEXT ---

User question: {question}

If the context fully answers the question, answer it.

If any part cannot be answered from the context, explicitly state what is
unknown and end your reply with the exact tag: {tag}

--- MANDATORY GENERATION INSTRUCTION ---
{language_instruction}
`;

export function buildContextBlock(chunks) {
  return chunks
    .map((c, i) => `[${i + 1}] (topic: ${c.topic}, lang: ${c.language})\n${c.text}`)
    .join("\n\n");
}

export function buildUserMessage(question, language, chunks) {
  const languageLabels = {
    en: "English",
    hi: "Hindi (हिंदी)",
    hinglish: "Hinglish (Roman Hindi)"
  };

  const languageInstructions = {
    en: "OUTPUT LANGUAGE: ENGLISH ONLY. You MUST write your entire response strictly in English. Do NOT output any Hindi text or Devanagari script (such as '(आवेदन पत्र)'), even if Hindi terms appear in the context.",
    hi: "OUTPUT LANGUAGE: HINDI (हिंदी) ONLY. You MUST write your entire response strictly in Hindi using Devanagari script.",
    hinglish: "OUTPUT LANGUAGE: HINGLISH ONLY. You MUST write your entire response strictly in natural conversational Hinglish using Roman/Latin script (e.g., 'Caste certificate ke liye photo aur aavedan patra chahiye'). Do NOT use Devanagari script."
  };

  const languageLabel = languageLabels[language] || "English";
  const languageInstruction = languageInstructions[language] || languageInstructions.en;
  const contextBlock = buildContextBlock(chunks);

  return USER_TEMPLATE
    .replace("{language_label}", languageLabel)
    .replace("{context_block}", contextBlock)
    .replace("{question}", question)
    .replace("{tag}", NEEDS_HUMAN_TAG)
    .replace("{language_instruction}", languageInstruction);
}

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
    generation_status: "gemini"
  };
}

export async function generateWithGemini(question, language, chunks) {
  if (!aiConfig.gemini.apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const aiClient = new GoogleGenAI({ apiKey: aiConfig.gemini.apiKey });
  const prompt = SYSTEM_PROMPT + "\n\n" + buildUserMessage(question, language, chunks);

  const response = await aiClient.models.generateContent({
    model: aiConfig.gemini.model,
    contents: [prompt],
    config: {
      temperature: 0.1
    }
  });

  const rawText = response.text || "";
  if (!rawText) {
    throw new Error("Gemini returned empty response.");
  }

  return processResponse(rawText);
}

