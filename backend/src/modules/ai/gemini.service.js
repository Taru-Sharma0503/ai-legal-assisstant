import { GoogleGenAI } from "@google/genai";
import { aiConfig } from "../../config/ai.js";

const NEEDS_HUMAN_TAG = "NEEDS_HUMAN";

const RESPONSE_INTENTS = {
  comparison: /\b(?:compare|comparison|versus|vs\.?|difference between)\b|\u0924\u0941\u0932\u0928\u093e|\u0905\u0902\u0924\u0930\s+(?:\u092c\u0924\u093e\u090f|\u0915\u094d\u092f\u093e)/i,
  documents: /\b(?:documents?|document list|paperwork|which documents|what documents|supporting papers)\b|\u0926\u0938\u094d\u0924\u093e\u0935\u0947\u091c|\u0915\u093e\u0917\u091c|\u0915\u094c\u0928\s+(?:\u0938\u0947\s+)?\u0915\u093e\u0917\u091c/i,
  process: /\b(?:how (?:do|can|to) i|how to apply|application process|process|procedure|steps?|apply for)\b|\u0915\u0948\u0938\u0947\s+(?:\u0906\u0935\u0947\u0926\u0928|\u0906\u0935\u0947\u0926\u0928\s+\u0915\u0930\u0942\u0902)|\u0906\u0935\u0947\u0926\u0928\s+\u092a\u094d\u0930\u0915\u094d\u0930\u093f\u092f\u093e|\u092a\u094d\u0930\u0915\u094d\u0930\u093f\u092f\u093e|\u091a\u0930\u0923/i,
  fee: /\b(?:fee|fees|cost|charge|how much|amount payable)\b|\u0936\u0941\u0932\u094d\u0915|\u092b\u0940\u0938|\u0915\u093f\u0924\u0928\u093e\s+(?:\u0932\u0917\u0924|\u0936\u0941\u0932\u094d\u0915)/i,
  confirmation: /^\s*(?:is|are|was|were|does|do|did|has|have|can|will)\b.{0,120}\?|\b(?:whether|verify|confirm|mentioned|listed)\b|\u0909\u0932\u094d\u0932\u0947\u0916\s+\u0939\u0948|\u092e\u094c\u091c\u0942\u0926\s+\u0939\u0948/i
};

export function classifyQuestionIntent(question = '') {
  for (const intent of ['comparison', 'documents']) {
    if (RESPONSE_INTENTS[intent].test(question)) return intent;
  }
  for (const intent of ['confirmation', 'process', 'fee']) {
    if (RESPONSE_INTENTS[intent].test(question)) return intent;
  }
  if (/\u0915\u094d\u092f\u093e/.test(question)) return 'confirmation';
  return 'factual';
}

export function buildResponseShapeInstruction(intent) {
  const instructions = {
    confirmation: 'RESPONSE SHAPE: Give a direct yes/no answer first, then the verified reason. Limit the answer to one or two sentences. Do not include a document checklist, application steps, or other retrieved material unless strictly necessary to qualify the yes/no answer.',
    documents: 'RESPONSE SHAPE: Return only the requested, verified documents. Preserve supported conditions and exceptions. Do not add process steps or unrelated service details.',
    process: 'RESPONSE SHAPE: Give the necessary verified application steps in concise numbered order. Preserve conditions, qualifications, and important cautions; omit unrelated checklists and facts.',
    fee: 'RESPONSE SHAPE: State the requested fee or fact directly, with only necessary verified qualifications. If unavailable, say so and direct the user to a human officer; do not infer an amount.',
    comparison: 'RESPONSE SHAPE: Compare only the subjects explicitly requested, using verified distinctions and necessary qualifications.',
    factual: 'RESPONSE SHAPE: State the requested fact directly and include only relevant verified qualifications.'
  };
  return instructions[intent] || instructions.factual;
}

export const SYSTEM_PROMPT = `
You are a trusted government-service assistant for Indian citizens.
You help people understand government services in Uttar Pradesh.

STRICT RULES:

1. Answer ONLY from the verified context passages provided below.
   List ONLY documents explicitly mentioned in the context. Do NOT invent or add
   common outside documents (such as Voter ID, Father's caste certificate, or
   Income certificate for Non-Creamy Layer) unless they appear in the provided text.

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

10. Preserve Indian statutory terms accurately across English, Hindi, and
    Hinglish. Do not replace a legal term with a similar-sounding ordinary word.
    When the context contains "begar", render it in Hindi as "बेगार", never
    "बेघर". Describe begar as a form of forced labour only when the supplied
    context explicitly supports that relationship. In Hinglish, retain "begar"
    or "begaar" and explain it only when the supplied context supports the
    explanation. If the context does not define a statutory term, preserve the
    original term rather than guessing or inventing a meaning.

11. Do not combine information from different government services unless
    the user explicitly asks for a comparison.

12. Never say "Based on the context" or "According to the retrieved context".
    Answer directly.

13. Stay focused on the user's specific question. Do not add constitutional
    remedies, unrelated statutes, or other legal detours unless the user asks
    for them or they are needed to answer the question. Never include drafting
    notes, placeholders, unfinished parentheticals, or instructions about what
    further advice or documents might be required.

15. Treat retrieved passages as evidence, not text to copy. Answer the exact
    question first, then include only details that answer it or prevent a
    misleading answer. Do not reproduce a whole passage, heading, checklist,
    or process just because it appears in the context.

16. Match the response to the question:
    - Yes/no or confirmation: begin with a clear yes or no, then briefly state
      the verified evidence. If evidence does not support either answer, use
      the existing insufficient-information fallback.
    - Document list: list only the documents requested and supported by the
      context, preserving any stated conditions and exceptions. Do not add
      application steps unless requested.
    - Application process: give concise, ordered steps for the necessary
      process, preserving supported conditions and important cautions.
    - Fee or other factual question: state the requested fact first, with
      relevant qualifications only.
    - Comparison: compare only the topics the user asked to compare.
    Keep legally important caveats, statutory distinctions, and safety advice.
    Never omit a condition if doing so would make the answer misleading.

14. For the Protection of Women from Domestic Violence Act, 2005, describe a
    section 18 protection order as an order made by a Magistrate, not as a
    "police or court order." Police do not issue that protection order. Where
    the supplied context supports it, describe police only as assisting with
    implementation when directed by the Magistrate; do not imply that police
    independently grant or determine the order.
`;

export const USER_TEMPLATE = `
Requested Language: {language_label}

--- VERIFIED CONTEXT ---

{context_block}

--- END CONTEXT ---
{comparison_availability}

User question: {question}

Answer the specific question directly before any supporting detail. Use the
verified passages only as evidence; do not reproduce them wholesale. Include
no unrelated service details. Choose the response form that matches the
question (confirmation, requested document list, ordered process, direct fact,
or focused comparison), retaining supported conditions and legally important
caveats. If the context fully answers the question, answer it.

If any part cannot be answered from the context, explicitly state what is
unknown and end your reply with the exact tag: {tag}

--- MANDATORY GENERATION INSTRUCTION ---
{response_shape_instruction}
{language_instruction}
`;

export function buildContextBlock(chunks) {
  return chunks
    .map((c, i) => `[${i + 1}] (service: ${c.title || c.service_id || 'unknown'}; service_id: ${c.service_id || 'unknown'}; topic: ${c.topic || 'general'}; lang: ${c.language || 'en'})\n${c.text}`)
    .join("\n\n");
}

export function buildUserMessage(question, language, chunks, options = {}) {
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
  const missing = options.missingComparisonServices || [];
  const comparisonAvailability = options.comparedServices?.length
    ? `\nCOMPARISON EVIDENCE STATUS:\n${options.comparedServices.map(({ service_id, title }) => {
      const unavailable = missing.some((item) => item.service_id === service_id);
      return `- ${title || service_id}: ${unavailable ? 'No verified passage for this service was retrieved. State that the requested details are unavailable; do not infer them.' : 'Verified passage(s) are included above.'}`;
    }).join('\n')}\n`
    : '';

  return USER_TEMPLATE
    .replace("{language_label}", languageLabel)
    .replace("{context_block}", contextBlock)
    .replace("{comparison_availability}", comparisonAvailability)
    .replace("{question}", question)
    .replace("{tag}", NEEDS_HUMAN_TAG)
    .replace("{response_shape_instruction}", buildResponseShapeInstruction(classifyQuestionIntent(question)))
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

let geminiClientInstance = null;
// Pass client object to inject, `false` to disable, `null` to reset.
export function _setGeminiClient(client) { geminiClientInstance = client; }

export async function generateWithGemini(question, language, chunks, options = {}) {
  if (geminiClientInstance === false) {
    throw new Error('GEMINI disabled by test injection.');
  }
  if (!geminiClientInstance && !aiConfig.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const aiClient = geminiClientInstance || new GoogleGenAI({
    apiKey: aiConfig.gemini.apiKey,
    httpOptions: {
      timeout: aiConfig.timeoutMs,
      // One attempt avoids long SDK backoff for quota exhaustion; app-level fallback handles failures.
      retryOptions: { attempts: 1 }
    }
  });
  const prompt = SYSTEM_PROMPT + '\n\n' + buildUserMessage(question, language, chunks, options);

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
