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
      hi: "वर्तमान ज्ञान आधार में इसके बारे में सत्यापित जानकारी उपलब्ध नहीं है।",
      hinglish: "Mere current verified knowledge base mein is information ke baare mein data available nahi hai."
    };

    return {
      answer: noInfo[language] || noInfo.en,
      needs_human: true,
      generation_status: "fallback"
    };
  }

  const seen = new Set();
  const uniqueTexts = [];
  for (const c of chunks) {
    if (!seen.has(c.text)) {
      seen.add(c.text);
      uniqueTexts.push(c.text);
    }
  }

  const prefix = {
    en: "According to the Uttar Pradesh eDistrict information:\n\n",
    hi: "उत्तर प्रदेश ई-डिस्ट्रिक्ट की जानकारी के अनुसार:\n\n",
    hinglish: "Uttar Pradesh eDistrict ki information ke according:\n\n"
  };

  const answerBody = uniqueTexts.map((t) => `• ${t}`).join("\n\n");
  const answer = (prefix[language] || prefix.en) + answerBody;

  return {
    answer,
    needs_human: false,
    generation_status: "fallback"
  };
}

export async function askService({ question, state = "Uttar Pradesh", language = "auto", conversationHistory = [] }) {
  const lang = language === "auto" ? detectLanguage(question) : language;

  if (touchesUnknownField(question)) {
    return {
      answer: UNKNOWN_FIELD_MSG[lang] || UNKNOWN_FIELD_MSG.en,
      needs_human: true,
      needsHuman: true,
      generation_status: "guardrail",
      confidence: 0,
      retrieval_score: 0,
      sources: [],
      suggested_service_id: null,
      suggestedService: null,
      language_used: lang,
      language: lang
    };
  }

  const chunks = await retrieve(question, state);

  if (!chunks || chunks.length === 0) {
    return {
      answer: LOW_CONF_MSG[lang] || LOW_CONF_MSG.en,
      needs_human: true,
      needsHuman: true,
      generation_status: "guardrail",
      confidence: 0,
      retrieval_score: 0,
      sources: [],
      suggested_service_id: null,
      suggestedService: null,
      language_used: lang,
      language: lang
    };
  }

  const detectedService = detectService(question);
  const filteredChunks = filterChunksByService(chunks, detectedService);

  const rawScore = filteredChunks[0]?.score || 0;
  const confidence = Math.round(rawScore * 10000) / 10000;

  const suggestedServiceId = confidence >= SIMILARITY_THRESHOLD ? filteredChunks[0].service_id : null;
  const sources = buildSources(filteredChunks);

  if (confidence < SIMILARITY_THRESHOLD) {
    return {
      answer: LOW_CONF_MSG[lang] || LOW_CONF_MSG.en,
      needs_human: true,
      needsHuman: true,
      generation_status: "guardrail",
      confidence,
      retrieval_score: confidence,
      sources,
      suggested_service_id: null,
      suggestedService: null,
      language_used: lang,
      language: lang
    };
  }

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
