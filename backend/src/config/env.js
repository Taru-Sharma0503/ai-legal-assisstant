import dotenv from 'dotenv';
dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is missing. Add it to backend/.env');
}

export const env = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ailegal?schema=public',
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // LLM Providers
  LLM_PROVIDER: (process.env.LLM_PROVIDER || 'gemini').toLowerCase(),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  GEMINI_EMBEDDING_MODEL: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_MODEL: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',

  // Qdrant
  QDRANT_URL: process.env.QDRANT_URL || '',
  QDRANT_API_KEY: process.env.QDRANT_API_KEY || '',
  QDRANT_COLLECTION: process.env.QDRANT_COLLECTION || 'citizen_service_chunks',
  SIMILARITY_THRESHOLD: process.env.SIMILARITY_THRESHOLD ? parseFloat(process.env.SIMILARITY_THRESHOLD) : 0.30,
  AI_REQUEST_TIMEOUT_MS: process.env.AI_REQUEST_TIMEOUT_MS ? parseInt(process.env.AI_REQUEST_TIMEOUT_MS, 10) : 15000,

  BASE_URL: process.env.BASE_URL || 'http://localhost:5000',
  MAX_FILE_SIZE_MB: process.env.MAX_FILE_SIZE_MB ? parseInt(process.env.MAX_FILE_SIZE_MB, 10) : 10,
  ALLOWED_FILE_EXTENSIONS: (process.env.ALLOWED_FILE_EXTENSIONS || 'pdf,jpg,jpeg,png,doc,docx').split(','),
  RATE_LIMIT_AI_MAX: process.env.RATE_LIMIT_AI_MAX ? parseInt(process.env.RATE_LIMIT_AI_MAX, 10) : 10,
  RATE_LIMIT_AI_WINDOW_SECONDS: process.env.RATE_LIMIT_AI_WINDOW_SECONDS ? parseInt(process.env.RATE_LIMIT_AI_WINDOW_SECONDS, 10) : 60,

  // RAG behaviour
  RAG_ALLOW_LOCAL_FALLBACK: (process.env.RAG_ALLOW_LOCAL_FALLBACK ?? 'true').toLowerCase() !== 'false'
};