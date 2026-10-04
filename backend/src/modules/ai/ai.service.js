import { detectLanguage } from "./language.js";
import { UNKNOWN_FIELD_KEYWORDS, UNKNOWN_FIELD_MSG, LOW_CONF_MSG } from "./knowledge.js";
import { generateWithGemini } from "./gemini.service.js";
import { generateWithGroq } from "./groq.service.js";
import { retrieve, detectService, filterChunksByService, buildSources } from "./rag.service.js";

const SIMILARITY_THRESHOLD = 0.3;

function touchesUnknownField(question) {
  if (!question) return false;
  const qLower = question.toLowerCase();
  return UNKNOWN_FIELD_KEYWORDS.some((kw) => qLower.includes(kw));
}

function fallbackFromChunks(chunks, language) {
  if (!chunks || chunks.length === 0) {
    const noInfo = {
      en: "I don't have verified information about this in the current knowledge base.",
      hi: "vartaman gyan adhar mein iske baare mein satyapit jaankari uplabdh nahi hai.",
      hinglish: "Mere current verified knowledge base mein is information ke baare mein data available nahi hai."
    };
    return {
      answer: noInfo[language] || noInfo.en,
      needs_human: true,
      generation_status: "fallback"
    };
  }

  const prefix = {
    en: "Here is the verified information I found:\n\n",
    hi: "Yahan satyapit jaankari hai:\n\n",
    hinglish: "Yahan verified information hai jo mujhe mili:\n\n"
  };

  const seen = new Set();
  const uniqueTexts = [];
  for (const c of chunks) {
    if (!seen.has(c.text)) {
      seen.add(c.text);
      uniqueTexts.push(c.text);
    }
  }

  const answerBody = uniqueTexts.map((t) => `- ${t}`).join("\n\n");
  const answer = (prefix[language] || prefix.en) + answerBody;

  return {
    answer,
    needs_human: false,
    generation_status: "fallback"
  };
}

export async function askService({ question, language, state = "Uttar Pradesh" }) {
  // 1. Determine the language to use for the response
  const lang = language || detectLanguage(question) || "en";

  // 2. Short-circuit for questions about fields we know we cannot answer
  if (touchesUnknownField(question)) {
    const detectedService = detectService(question);
    return {
      answer: UNKNOWN_FIELD_MSG[lang] || UNKNOWN_FIELD_MSG.en,
      needs_human: true,
      needsHuman: true,
      generation_status: "fallback",
      confidence: 0,
      retrieval_score: 0,
      sources: [],
      suggested_service_id: detectedService || null,
      suggestedService: detectedService || null,
      language_used: lang,
      language: lang
    };
  }

  // 3. Retrieve relevant chunks from RAG (Qdrant or local fallback)
  const chunks = await retrieve(question, state);

  // 4. Detect which service the question is about
  const suggestedServiceId = detectService(question) || (chunks[0]?.service_id ?? null);

  // 5. Filter chunks to the relevant service only
  const filteredChunks = filterChunksByService(chunks, suggestedServiceId);

  // 6. Compute confidence score
  const topScore = filteredChunks[0]?.score ?? 0;
  const confidence = Math.round(topScore * 100) / 100;

  // 7. Build sources for the response
  const sources = buildSources(filteredChunks);

  // 8. If confidence is too low or no chunks, return low-confidence message
  if (filteredChunks.length === 0 || topScore < SIMILARITY_THRESHOLD) {
    return {
      answer: LOW_CONF_MSG[lang] || LOW_CONF_MSG.en,
      needs_human: true,
      needsHuman: true,
      generation_status: "fallback",
      confidence,
      retrieval_score: confidence,
      sources,
      suggested_service_id: suggestedServiceId,
      suggestedService: suggestedServiceId,
      language_used: lang,
      language: lang
    };
  }

  // 9. Generate the AI response (Gemini primary, Groq fallback, then local chunk fallback)
  let genResult = null;

  try {
    genResult = await generateWithGemini(question, lang, filteredChunks);
  } catch (geminiErr) {
    console.warn("Gemini unavailable, attempting Groq fallback:", geminiErr.message);
    try {
      genResult = await generateWithGroq(question, lang, filteredChunks);
    } catch (groqErr) {
      console.error("Both Gemini and Groq failed, using grounded chunk fallback:", groqErr.message);
      genResult = fallbackFromChunks(filteredChunks, lang);
    }
  }

  return {
    answer: genResult.answer,
    needs_human: genResult.needs_human,
    needsHuman: genResult.needs_human,
    generation_status: genResult.generation_status,
    confidence,
    retrieval_score: confidence,
    sources,
    suggested_service_id: suggestedServiceId,
    suggestedService: suggestedServiceId,
    language_used: lang,
    language: lang
  };
}
