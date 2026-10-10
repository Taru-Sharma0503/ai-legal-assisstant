import { GoogleGenAI } from '@google/genai';
import { Groq } from 'groq-sdk';
import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from './env.js';

let aiClient = null;
let groqClient = null;
let qdrantClient = null;

// 1. Google Gemini Client
if (env.GEMINI_API_KEY) {
  try {
    aiClient = new GoogleGenAI({
      apiKey: env.GEMINI_API_KEY
    });
    console.log('[AI] Google Gemini client initialized successfully');
  } catch (error) {
    console.warn('[AI] Failed to initialize GoogleGenAI:', error.message);
  }
} else {
  console.warn('[AI] GEMINI_API_KEY not found in environment variables.');
}

// 2. Groq Fallback Client
if (env.GROQ_API_KEY) {
  try {
    groqClient = new Groq({
      apiKey: env.GROQ_API_KEY
    });
    console.log('[AI] Groq client initialized successfully');
  } catch (error) {
    console.warn('[AI] Failed to initialize Groq:', error.message);
  }
} else {
  console.warn('[AI] GROQ_API_KEY not found in environment variables.');
}

// 3. Qdrant Client
if (env.QDRANT_URL) {
  try {
    const qdrantOpts = { url: env.QDRANT_URL };
    if (env.QDRANT_API_KEY) {
      qdrantOpts.apiKey = env.QDRANT_API_KEY;
    }
    qdrantClient = new QdrantClient(qdrantOpts);
    console.log('[AI] Qdrant client initialized successfully');
  } catch (error) {
    console.warn('[AI] Failed to initialize QdrantClient:', error.message);
  }
} else {
  console.error('[AI] QDRANT_URL is not set. Set it to your hosted Qdrant cluster URL in backend/.env');
}

export const AI_CONFIG = {
  provider: env.LLM_PROVIDER || 'gemini',
  geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
  geminiEmbeddingModel: env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
  groqModel: env.GROQ_MODEL || 'openai/gpt-oss-120b',
  collectionName: env.QDRANT_COLLECTION || 'citizen_service_chunks',
  similarityThreshold: env.SIMILARITY_THRESHOLD || 0.30,
  timeoutMs: env.AI_REQUEST_TIMEOUT_MS || 15000,
  temperature: 0.1
};

export const aiConfig = {
  get generationProvider() {
    const provider = (process.env.LLM_PROVIDER || env.LLM_PROVIDER || 'gemini').toLowerCase();
    return ['gemini', 'groq', 'auto'].includes(provider) ? provider : 'gemini';
  },
  gemini: {
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL || 'gemini-2.5-flash',
    embeddingModel: env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001'
  },
  groq: {
    apiKey: env.GROQ_API_KEY,
    model: env.GROQ_MODEL || 'openai/gpt-oss-120b'
  },
  qdrant: {
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY,
    collection: env.QDRANT_COLLECTION || 'citizen_service_chunks'
  },
  get similarityThreshold() {
    return process.env.SIMILARITY_THRESHOLD ? parseFloat(process.env.SIMILARITY_THRESHOLD) : (env.SIMILARITY_THRESHOLD ?? 0.30);
  },
  timeoutMs: env.AI_REQUEST_TIMEOUT_MS ?? 15000,
  get allowLocalFallback() {
    return (process.env.RAG_ALLOW_LOCAL_FALLBACK ?? String(env.RAG_ALLOW_LOCAL_FALLBACK ?? 'true')).toLowerCase() !== 'false';
  }
};

export { aiClient, groqClient, qdrantClient };
