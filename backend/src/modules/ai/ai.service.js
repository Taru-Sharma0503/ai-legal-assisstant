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

    if (!conversation) {
    const mock = mockConversations.get(conversationId);
    if (mock && mock.userId === userId) conversation = mock;
  }

  const answerBody = uniqueTexts.map((t) => `• ${t}`).join("\n\n");
  const answer = (prefix[language] || prefix.en) + answerBody;

  return {
    answer,
    needs_human: false,
    generation_status: "fallback"
  };
};

export const askAi = async (userId, conversationId, { message, language }) => {
    // 1. The conversation must exist AND belong to this user
  let conversation = null;
  if (prisma && isDbConnected) {
    try {
      conversation = await prisma.aiConversation.findFirst({
        where: { id: conversationId, userId }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!conversation) {
    const mock = mockConversations.get(conversationId);
    if (mock && mock.userId === userId) conversation = mock;
  }

  if (!conversation) {
    throw ApiError.notFound('Conversation not found');
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
