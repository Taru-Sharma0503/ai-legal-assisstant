import crypto from 'crypto';
import { prisma, isDbConnected } from '../../config/db.js';
import { ApiError } from '../../utils/apiError.js';
import { cacheGet, cacheSet } from '../../config/redis.js';
import { detectLanguage, normalizeQuery, retrieveTopKChunks, findSuggestedService } from './rag.service.js';
import { generateGroundedResponse } from './gemini.service.js';

// In-memory fallback conversations for resilience
const mockConversations = new Map();

export const createConversation = async (userId, { language = 'hi', title = null }) => {
  const conversationId = crypto.randomUUID();
  const now = new Date();

  let conversation = null;
  if (prisma && isDbConnected) {
    try {
      conversation = await prisma.aiConversation.create({
        data: {
          id: conversationId,
          userId,
          language,
          title
        }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!conversation) {
    conversation = {
      id: conversationId,
      userId,
      language,
      title,
      createdAt: now,
      updatedAt: now,
      messages: []
    };
    mockConversations.set(conversationId, conversation);
  }

  return {
    conversationId: conversation.id,
    language: conversation.language,
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString ? conversation.createdAt.toISOString() : now.toISOString()
  };
};

export const getConversations = async (userId) => {
  let list = [];
  if (prisma && isDbConnected) {
    try {
      list = await prisma.aiConversation.findMany({
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
      // fallback
    }
  }

  if (list.length === 0) {
    for (const conv of mockConversations.values()) {
      if (conv.userId === userId) {
        list.push({
          id: conv.id,
          title: conv.title,
          language: conv.language,
          updatedAt: conv.updatedAt
        });
      }
    }
  }

  return list.map(c => ({
    id: c.id,
    title: c.title || 'Untitled Query',
    language: c.language,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt
  }));
};

export const getConversationById = async (userId, conversationId) => {
  let conversation = null;
  if (prisma && isDbConnected) {
    try {
      conversation = await prisma.aiConversation.findFirst({
        where: { id: conversationId, userId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              sender: true,
              content: true,
              createdAt: true
            }
          }
        }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!conversation) {
    conversation = mockConversations.get(conversationId);
  }

  if (!conversation) {
    throw ApiError.notFound('Conversation not found');
  }

  return {
    id: conversation.id,
    title: conversation.title || 'Untitled Query',
    language: conversation.language,
    messages: (conversation.messages || []).map(m => ({
      id: m.id,
      sender: m.sender,
      content: m.content,
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt
    }))
  };
};

export const askAi = async (userId, conversationId, { message, language }) => {
  // 1. Validate conversation exists or fetch
  let conversation = null;
  if (prisma && isDbConnected) {
    try {
      conversation = await prisma.aiConversation.findUnique({
        where: { id: conversationId }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!conversation) {
    conversation = mockConversations.get(conversationId);
  }

  if (!conversation) {
    conversation = {
      id: conversationId,
      userId,
      language: language || 'hi',
      title: message.substring(0, 30) + '...',
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: []
    };
    mockConversations.set(conversationId, conversation);
  }

  // 2. Detect language & normalize query
  const detectedLang = detectLanguage(message, language || conversation.language);
  const normalizedQuery = normalizeQuery(message);

  // Check Redis cache for frequent queries
  const queryHash = crypto.createHash('md5').update(`${detectedLang}:${normalizedQuery}`).digest('hex');
  const cacheKey = `ai:${queryHash}`;
  const cachedResponse = await cacheGet(cacheKey);

  // 3. RAG Retrieval & top-K chunks
  const retrievedChunks = await retrieveTopKChunks(normalizedQuery, detectedLang, 3);
  const suggestedService = await findSuggestedService(retrievedChunks, normalizedQuery);

  // 4. Sources formatting
  const sources = retrievedChunks.map(c => ({
    id: c.id,
    title: c.title,
    sourceUrl: c.sourceUrl || '',
    department: c.department
  }));

  // 5. Generate grounded response with Gemini
  let aiOutput;
  if (cachedResponse) {
    aiOutput = cachedResponse;
  } else {
    aiOutput = await generateGroundedResponse({
      query: message,
      language: detectedLang,
      retrievedChunks,
      suggestedService
    });
    // Cache safe factual responses with TTL of 1 hour
    if (!aiOutput.needsHuman && aiOutput.confidence > 0.8) {
      await cacheSet(cacheKey, aiOutput, 3600);
    }
  }

  // 6. Save user message & AI response to database
  const userMsgId = crypto.randomUUID();
  const aiMsgId = crypto.randomUUID();
  const now = new Date();

  if (prisma && isDbConnected) {
    try {
      await prisma.$transaction([
        prisma.aiMessage.create({
          data: {
            id: userMsgId,
            conversationId,
            sender: 'USER',
            content: message,
            createdAt: now
          }
        }),
        prisma.aiMessage.create({
          data: {
            id: aiMsgId,
            conversationId,
            sender: 'AI',
            content: aiOutput.answer,
            confidence: Number(aiOutput.confidence),
            needsHuman: Boolean(aiOutput.needsHuman),
            sources: JSON.stringify(sources),
            suggestedServiceId: suggestedService?.id || null,
            suggestedServiceName: suggestedService?.name || null,
            createdAt: new Date(now.getTime() + 1000)
          }
        }),
        prisma.aiConversation.update({
          where: { id: conversationId },
          data: {
            updatedAt: new Date(),
            title: conversation.title || message.substring(0, 40)
          }
        })
      ]);
    } catch (err) {
      // fallback
    }
  }

  // In-memory fallback tracking
  if (!conversation.messages) conversation.messages = [];
  conversation.messages.push({
    id: userMsgId,
    sender: 'USER',
    content: message,
    createdAt: now
  });
  conversation.messages.push({
    id: aiMsgId,
    sender: 'AI',
    content: aiOutput.answer,
    createdAt: new Date(now.getTime() + 1000)
  });
  conversation.updatedAt = new Date();

  return {
    messageId: aiMsgId,
    answer: aiOutput.answer,
    language: detectedLang,
    confidence: Number(aiOutput.confidence),
    needsHuman: Boolean(aiOutput.needsHuman),
    sources,
    suggestedService: suggestedService
      ? {
          id: suggestedService.id,
          name: suggestedService.name
        }
      : null
  };
};
