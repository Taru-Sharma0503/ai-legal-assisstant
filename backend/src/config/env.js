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
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  BASE_URL: process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`,
  MAX_FILE_SIZE_MB: process.env.MAX_FILE_SIZE_MB ? parseInt(process.env.MAX_FILE_SIZE_MB, 10) : 10,
  ALLOWED_FILE_EXTENSIONS: (process.env.ALLOWED_FILE_EXTENSIONS || 'pdf,jpg,jpeg,png,doc,docx').split(','),
  RATE_LIMIT_AI_MAX: process.env.RATE_LIMIT_AI_MAX ? parseInt(process.env.RATE_LIMIT_AI_MAX, 10) : 10,
  RATE_LIMIT_AI_WINDOW_SECONDS: process.env.RATE_LIMIT_AI_WINDOW_SECONDS ? parseInt(process.env.RATE_LIMIT_AI_WINDOW_SECONDS, 10) : 60
};