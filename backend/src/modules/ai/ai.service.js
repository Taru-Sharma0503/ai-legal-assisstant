import { detectLanguage } from './language.js';
import { UNKNOWN_FIELD_KEYWORDS, UNKNOWN_FIELD_MSG, LOW_CONF_MSG } from './knowledge.js';
import { generateWithGemini } from './gemini.service.js';
import { generateWithGroq } from './groq.service.js';
import { retrieve, detectService, isLegalQuestion, filterChunksByService, buildSources } from './rag.service.js';
import { aiConfig } from '../../config/ai.js';

const LEGAL_QUERY_RELEVANCE = [
  {
    question: /cybercrime|cyber\s+crime|cyber\s+fraud|online\s+(?:payment\s+)?(?:financial\s+)?fraud|payment\s+fraud|financial\s+cyber\s+fraud|stolen\s+money|unauthori[sz]ed\s+(?:payment|transaction|transfer)|1930|cybercrime\.gov\.in|अनधिकृत\s+(?:भुगतान|लेनदेन)|पैसे.{0,35}चोरी|रुपये.{0,35}चोरी|(?:online|internet|bank|account).{0,35}(?:fraud|scam|stolen)|(?:paise|paisa|rupaye).{0,35}(?:chori|thagi)/i,
    candidate: /cybercrime|cyber\s+crime|cyber\s+fraud|financial\s+fraud|cybercrime\.gov\.in|\b1930\b|\bi4c\b/i
  },
  {
    question: /consumer|\b1915\b|\bnch\b|defective\s+product|product\s+defect|seller.{0,25}refund|refund.{0,25}(?:seller|product|purchase|order)|warrant(?:y|ies)|poor\s+service/i,
    candidate: /consumer|\bnch\b|\b1915\b|consumer\s+commission/i
  },
  {
    question: /domestic\s+violence|gharelu\s+hinsa|pwdva|protection\s+order/i,
    candidate: /domestic\s+violence|pwdva|protection\s+order|protection\s+officer|residence\s+order|women\s+helpline|\b181\b|legal\s+aid|free\s+legal\s+services?|legal\s+services\s+authorities?\s+act/i
  }
];
const CYBERCRIME_PRIORITY_RE = /\b(?:stole|stolen|theft|unauthori[sz]ed|unapproved|fraudulent)\b.{0,50}\b(?:money|funds|payment|transaction|transfer|account)\b|\b(?:money|funds)\b.{0,50}\b(?:stolen|taken|deducted)\b|\b(?:online|internet|bank|account|payment|transaction|transfer)\b.{0,50}\b(?:fraud|scam|theft|stole|stolen|unauthori[sz]ed|unapproved)\b|\b(?:online|payment)\s+(?:payment\s+)?fraud\b|ऑनलाइन\s+(?:पेमेंट|भुगतान)?\s*(?:फ्रॉड|धोखाधड़ी)|(?:पैसे|रुपये)\s*(?:चोरी|कट|निकाल)|अनधिकृत\s+(?:भुगतान|लेनदेन)|(?:ऑनलाइन|बैंक|खाते|लेनदेन).{0,50}(?:पैसे|रुपये).{0,35}(?:चोरी|कट|निकाल)/i;

// Keep topic-specific legal results together for both generation and citations.
// When this question belongs to a known topic but retrieval returns no matching
// passage, the normal empty-candidate guard escalates instead of citing unrelated hits.
export function filterLegalChunksForQuestion(question, chunks) {
  const cybercrimeRule = LEGAL_QUERY_RELEVANCE[0];
  // Theft, unauthorized transactions, and financial fraud are cyber-reporting
  // intents even if the question also mentions a consumer grievance channel.
  if (CYBERCRIME_PRIORITY_RE.test(question)) {
    return chunks.filter((chunk) =>
      cybercrimeRule.candidate.test(`${chunk.topic || ''} ${chunk.title || ''} ${chunk.text || ''}`)
    );
  }
  if (/\b(?:compare|comparison|versus|vs\.?|difference between)\b|\b(?:constitution|constitutional|article\s*226|writ jurisdiction)\b/i.test(question)) {
    return chunks;
  }
  const rules = LEGAL_QUERY_RELEVANCE.filter(({ question: pattern }) => pattern.test(question));
  // Leave explicitly cross-topic queries intact so relevant statutes are not suppressed.
  if (rules.length !== 1) return chunks;
  const [rule] = rules;
  return chunks.filter((chunk) =>
    rule.candidate.test(`${chunk.topic || ''} ${chunk.title || ''} ${chunk.text || ''}`)
  );
}

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
    return { answer: noInfo[language] || noInfo.en, needs_human: true, generation_status: 'fallback' };
  }

  const prefix = {
    en: "Here is the verified information I found:\n\n",
    hi: "यहाँ मुझे जो सत्यापित जानकारी मिली:\n\n",
    hinglish: "Yahan verified information hai jo mujhe mili:\n\n"
  };

  const seen = new Set();
  const uniqueTexts = [];
  for (const c of chunks) {
    if (!seen.has(c.text)) { seen.add(c.text); uniqueTexts.push(c.text); }
  }
  const answer = (prefix[language] || prefix.en) + uniqueTexts.map((t) => "- " + t).join("\n\n");
  return { answer, needs_human: false, generation_status: 'fallback' };
}

const GEMINI_QUOTA_COOLDOWN_MS = 60_000;
let geminiQuotaCooldownUntil = 0;

function isQuotaError(error) {
  return Number(error?.status ?? error?.statusCode) === 429 ||
    /quota|resource_exhausted/i.test(String(error?.code || error?.message || ''));
}

function safeProviderError(error) {
  const status = Number(error?.status ?? error?.statusCode);
  return Number.isFinite(status) && status > 0
    ? `HTTP ${status}`
    : String(error?.name || 'ProviderError').slice(0, 60);
}

export async function askService({ question, language, state = 'Uttar Pradesh', skipLlm = false }) {
  // Task C-1: treat 'auto', undefined, empty string as 'detect'; call detectLanguage
  const lang =
    !language || language === 'auto' ? (detectLanguage(question) || 'en') : language;

  // Short-circuit for fields we cannot answer (no LLM call)
  if (touchesUnknownField(question)) {
    const detectedService = isLegalQuestion(question) ? null : detectService(question);
    return {
      answer: UNKNOWN_FIELD_MSG[lang] || UNKNOWN_FIELD_MSG.en,
      needs_human: true, needsHuman: true,
      generation_status: 'fallback',
      confidence: 0, retrieval_score: 0,
      retrieval_source: null, fallback_reason: 'unknown_field',
      guard_reason: 'unknown_field',
      sources: [],
      suggested_service_id: detectedService || null,
      suggestedService: detectedService || null,
      language_used: lang, language: lang
    };
  }

  // Retrieve – returns { chunks, retrievalSource, fallbackReason }
  const { chunks, retrievalSource, fallbackReason } = await retrieve(question, state);
  const legalQuestion = isLegalQuestion(question);

  // Two-tier threshold strategy:
  //   • regex-matched service or legal queries: use aiConfig.similarityThreshold (lenient) –
  //     the domain is already known, so chunks only need to meet the configured relevance bar.
  //   • non-regex Qdrant queries: use NON_REGEX_THRESHOLD (0.75) so near-domain OOS queries
  //     (max eval score = 0.74) are correctly rejected. Evaluation data:
  //       In-scope min: 0.70 (all regex-routed, threshold irrelevant)
  //       OOS max:      0.74 (no regex match, strict threshold needed)
  const regexService = legalQuestion ? null : detectService(question);
  const NON_REGEX_THRESHOLD = 0.76; // above highest observed OOS score (0.750 in local fallback, 0.740 in Qdrant)
  const threshold = regexService || legalQuestion
    ? (retrievalSource === 'qdrant' ? aiConfig.similarityThreshold : Math.min(aiConfig.similarityThreshold, 0.3))
    : Math.max(NON_REGEX_THRESHOLD, aiConfig.similarityThreshold);

  // If regex matched, filter by that service; otherwise candidate is all retrieved chunks
  const candidateChunks = legalQuestion
    ? filterLegalChunksForQuestion(question, chunks)
    : regexService ? filterChunksByService(chunks, regexService) : chunks;
  const topScore = candidateChunks[0]?.score ?? 0;

  // Rule: use detectService(question) if it matches; otherwise use top chunk's service ONLY
  // if top score >= threshold (stricter for non-regex path); otherwise null.
  let suggestedServiceId = regexService;
  if (!suggestedServiceId) {
    if (candidateChunks.length > 0 && topScore >= threshold) {
      suggestedServiceId = legalQuestion ? null : candidateChunks[0]?.service_id ?? null;
    } else {
      suggestedServiceId = null;
    }
  }

  const filteredChunks = legalQuestion
    ? candidateChunks
    : suggestedServiceId ? filterChunksByService(candidateChunks, suggestedServiceId) : [];
  const confidence = Math.round(topScore * 100) / 100;
  const sources = buildSources(filteredChunks.length > 0 ? filteredChunks : candidateChunks);

  if (filteredChunks.length === 0 || topScore < threshold) {
    const guardReason = candidateChunks.length === 0 ? 'no_chunks' : 'similarity_threshold';
    // When the guard_reason is similarity_threshold or no_chunks and no service was detected by regex, suggested_service_id must be null.
    const finalSuggestedService = regexService || null;
    return {
      answer: LOW_CONF_MSG[lang] || LOW_CONF_MSG.en,
      needs_human: true, needsHuman: true,
      generation_status: 'fallback',
      confidence, retrieval_score: confidence,
      retrieval_source: retrievalSource, fallback_reason: fallbackReason || 'low_confidence',
      guard_reason: guardReason,
      sources: filteredChunks.length > 0 ? sources : [],
      suggested_service_id: finalSuggestedService,
      suggestedService: finalSuggestedService,
      language_used: lang, language: lang
    };
  }

  if (skipLlm) {
    return {
      answer: 'LLM skipped (--no-llm)',
      needs_human: false, needsHuman: false,
      generation_status: 'skipped',
      confidence, retrieval_score: confidence,
      retrieval_source: retrievalSource, fallback_reason: fallbackReason,
      guard_reason: 'in_scope',
      sources,
      suggested_service_id: suggestedServiceId, suggestedService: suggestedServiceId,
      language_used: lang, language: lang
    };
  }

  let genResult = null;
  const provider = aiConfig.generationProvider;
  const useGemini = provider !== 'groq' && Date.now() >= geminiQuotaCooldownUntil;

  if (!useGemini) {
    try {
      genResult = await generateWithGroq(question, lang, filteredChunks);
    } catch (groqErr) {
      console.error('[AI] Groq generation failed; using grounded chunk fallback:', safeProviderError(groqErr));
      genResult = fallbackFromChunks(filteredChunks, lang);
    }
  } else {
    try {
      genResult = await generateWithGemini(question, lang, filteredChunks);
      geminiQuotaCooldownUntil = 0;
    } catch (geminiErr) {
      if (isQuotaError(geminiErr)) geminiQuotaCooldownUntil = Date.now() + GEMINI_QUOTA_COOLDOWN_MS;
      console.warn('[AI] Gemini unavailable, attempting Groq fallback:', safeProviderError(geminiErr));
      try {
        genResult = await generateWithGroq(question, lang, filteredChunks);
      } catch (groqErr) {
        console.error('[AI] Both generation providers failed; using grounded chunk fallback:', safeProviderError(groqErr));
        genResult = fallbackFromChunks(filteredChunks, lang);
      }
    }
  }

  return {
    answer: genResult.answer,
    needs_human: genResult.needs_human, needsHuman: genResult.needs_human,
    generation_status: genResult.generation_status,
    confidence, retrieval_score: confidence,
    retrieval_source: retrievalSource, fallback_reason: fallbackReason,
    guard_reason: genResult.needs_human ? 'llm_needs_human' : 'in_scope',
    sources,
    suggested_service_id: suggestedServiceId, suggestedService: suggestedServiceId,
    language_used: lang, language: lang
  };
}

// ── Conversation API Implementation ──────────────────────────────────────────
import crypto from 'crypto';
import { prisma, isDbConnected } from '../../config/db.js';
import { INITIAL_SERVICES } from '../services/service.service.js';
import { logger } from '../../utils/logger.js';
import { ApiError } from '../../utils/apiError.js';

export const SLUG_TO_SERVICE_NAME = {
  up_income_certificate: 'Income Certificate',
  up_caste_certificate: 'Caste Certificate',
  up_domicile_certificate: 'Domicile Certificate',
  up_birth_certificate: 'Birth Certificate',
  up_death_certificate: 'Death Certificate',
  up_marriage_certificate: 'Marriage Certificate',
  up_ews_certificate: 'EWS Certificate',
  up_disability_certificate: 'Disability Certificate',
  up_character_certificate: 'Character Certificate'
};

export async function resolveSuggestedService(slug) {
  if (!slug) return null;
  const serviceName = SLUG_TO_SERVICE_NAME[slug];
  if (!serviceName) {
    logger.warn(`[AI] Unknown service slug: ${slug}`);
    return null;
  }

  let service = null;
  if (prisma && isDbConnected) {
    try {
      service = await prisma.service.findFirst({
        where: {
          name: { equals: serviceName, mode: 'insensitive' },
          isActive: true
        },
        select: { id: true, name: true }
      });
    } catch (err) {
      // Fall through to fallback
    }
  }

  if (!service) {
    service = INITIAL_SERVICES.find(
      (s) => s.name.toLowerCase() === serviceName.toLowerCase() && s.isActive
    );
  }

  if (service) {
    return { id: service.id, name: service.name };
  }

  logger.warn(`[AI] Service not found for slug: ${slug} (name: ${serviceName})`);
  return null;
}

// In-memory fallback store for when DB is disconnected
let inMemoryLogged = false;
export const inMemoryConversations = new Map();
export const inMemoryMessages = new Map();

function logInMemoryActive() {
  if (!inMemoryLogged) {
    logger.info('[AI] In-memory conversation store is active');
    inMemoryLogged = true;
  }
}

export async function createConversationService(userId, { language = 'en', title }) {
  const convId = crypto.randomUUID();
  const now = new Date();
  const convTitle = title || 'New Conversation';

  let conv = null;
  if (prisma && isDbConnected) {
    try {
      conv = await prisma.aiConversation.create({
        data: {
          id: convId,
          userId,
          language,
          title: convTitle,
          createdAt: now,
          updatedAt: now
        }
      });
    } catch (err) {
      // Fallback to in-memory
    }
  }

  if (!conv) {
    logInMemoryActive();
    conv = {
      id: convId,
      userId,
      language,
      title: convTitle,
      createdAt: now,
      updatedAt: now
    };
    inMemoryConversations.set(convId, conv);
    inMemoryMessages.set(convId, []);
  }

  return {
    conversationId: conv.id,
    language: conv.language,
    title: conv.title,
    createdAt: conv.createdAt
  };
}

export async function listConversationsService(userId) {
  let conversations = null;
  if (prisma && isDbConnected) {
    try {
      conversations = await prisma.aiConversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          language: true,
          updatedAt: true
        }
      });
    } catch (err) {
      // Fallback
    }
  }

  if (!conversations) {
    logInMemoryActive();
    conversations = Array.from(inMemoryConversations.values())
      .filter((c) => c.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((c) => ({
        id: c.id,
        title: c.title,
        language: c.language,
        updatedAt: c.updatedAt
      }));
  }

  return conversations;
}

export async function getConversationDetailsService(userId, conversationId) {
  let conv = null;
  let rawMessages = [];

  if (prisma && isDbConnected) {
    try {
      conv = await prisma.aiConversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });
      if (conv) {
        if (conv.userId !== userId) {
          throw ApiError.notFound('Conversation not found');
        }
        rawMessages = conv.messages;
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Fallback
    }
  }

  if (!conv) {
    logInMemoryActive();
    conv = inMemoryConversations.get(conversationId);
    if (!conv || conv.userId !== userId) {
      throw ApiError.notFound('Conversation not found');
    }
    rawMessages = inMemoryMessages.get(conversationId) || [];
  }

  const messages = rawMessages.map((m) => ({
    id: m.id,
    sender: m.sender,
    content: m.content,
    createdAt: m.createdAt
  }));

  return {
    id: conv.id,
    title: conv.title,
    language: conv.language,
    messages
  };
}

export async function postMessageService(userId, conversationId, { question, language }) {
  let conv = null;
  let existingMessages = [];

  if (prisma && isDbConnected) {
    try {
      conv = await prisma.aiConversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } }
        }
      });
      if (conv) {
        if (conv.userId !== userId) {
          throw ApiError.notFound('Conversation not found');
        }
        existingMessages = conv.messages;
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Fallback
    }
  }

  if (!conv) {
    logInMemoryActive();
    conv = inMemoryConversations.get(conversationId);
    if (!conv || conv.userId !== userId) {
      throw ApiError.notFound('Conversation not found');
    }
    existingMessages = inMemoryMessages.get(conversationId) || [];
  }

  const userMsgId = crypto.randomUUID();
  const nowUser = new Date();
  const userMsgData = {
    id: userMsgId,
    conversationId,
    sender: 'USER',
    content: question,
    createdAt: nowUser
  };

  // Heuristic context inheritance for follow-up questions:
  // Load last 6 messages of conversation. If the new question has no regex-detected service,
  // find the most recent earlier USER message that does, and combine as "<earlier question>. <new message>" for retrieval.
  const last6 = existingMessages.slice(-6);
  let retrievalText = question;
  const currentService = detectService(question);

  if (!currentService) {
    for (let i = existingMessages.length - 1; i >= 0; i--) {
      const prevMsg = existingMessages[i];
      if (prevMsg.sender === 'USER' && prevMsg.content) {
        const prevService = detectService(prevMsg.content);
        if (prevService) {
          retrievalText = `${prevMsg.content}. ${question}`;
          break;
        }
      }
    }
  }

  const langToUse = language || conv.language || 'en';
  const historyForLlm = last6.map((m) => ({
    role: m.sender === 'USER' ? 'user' : 'model',
    content: m.content
  }));

  const result = await askService({
    question: retrievalText,
    language: langToUse,
    state: 'Uttar Pradesh',
    conversationHistory: historyForLlm
  });

  const suggestedService = await resolveSuggestedService(result.suggested_service_id);

  const formattedSources = (result.sources || []).map((s) => ({
    id: s.id || s.source_id || s.source_ref || s.chunk_id || '',
    title: s.title || s.topic || '',
    sourceUrl: s.source_url || s.url || s.sourceUrl || '',
    department: s.department || ''
  }));

  const aiMsgId = crypto.randomUUID();
  const nowAi = new Date();
  const confidenceNum = typeof result.confidence === 'number' ? result.confidence : 0;
  const needsHumanBool = Boolean(result.needs_human ?? result.needsHuman ?? false);

  const aiMsgData = {
    id: aiMsgId,
    conversationId,
    sender: 'AI',
    content: result.answer,
    confidence: confidenceNum,
    needsHuman: needsHumanBool,
    sources: formattedSources,
    suggestedServiceId: suggestedService?.id || null,
    suggestedServiceName: suggestedService?.name || null,
    createdAt: nowAi
  };

  let savedInDb = false;
  if (prisma && isDbConnected) {
    try {
      await prisma.aiMessage.createMany({
        data: [
          {
            id: userMsgData.id,
            conversationId,
            sender: 'USER',
            content: userMsgData.content,
            createdAt: userMsgData.createdAt
          },
          {
            id: aiMsgData.id,
            conversationId,
            sender: 'AI',
            content: aiMsgData.content,
            confidence: aiMsgData.confidence,
            needsHuman: aiMsgData.needsHuman,
            sources: aiMsgData.sources,
            suggestedServiceId: aiMsgData.suggestedServiceId,
            suggestedServiceName: aiMsgData.suggestedServiceName,
            createdAt: aiMsgData.createdAt
          }
        ]
      });

      const newTitle = conv.title === 'New Conversation' ? question.slice(0, 40) : conv.title;
      await prisma.aiConversation.update({
        where: { id: conversationId },
        data: { title: newTitle, updatedAt: nowAi }
      });
      savedInDb = true;
    } catch (dbErr) {
      // Fallback
    }
  }

  if (!savedInDb) {
    logInMemoryActive();
    const list = inMemoryMessages.get(conversationId) || [];
    list.push(userMsgData, aiMsgData);
    inMemoryMessages.set(conversationId, list);

    if (conv.title === 'New Conversation') {
      conv.title = question.slice(0, 40);
    }
    conv.updatedAt = nowAi;
  }

  return {
    messageId: aiMsgId,
    answer: result.answer,
    language: result.language_used || langToUse,
    confidence: confidenceNum,
    needsHuman: needsHumanBool,
    sources: formattedSources,
    suggestedService
  };
}
