import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

let prisma;
let isDbConnected = false;

try {
  prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error'] : ['error']
  });
} catch (error) {
  logger.error('[DB] Failed to instantiate PrismaClient:', error.message);
}

export const connectDb = async () => {
  if (!prisma) return false;

  try {
    // Probe database connection with a fast timeout
    const connectPromise = prisma.$connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timed out')), 2000)
    );

    await Promise.race([connectPromise, timeoutPromise]);
    isDbConnected = true;
    logger.info('[DB] PostgreSQL Database connected successfully');
    return true;
  } catch (error) {
    isDbConnected = false;
    logger.warn(`[DB] Database connection warning: ${error.message}`);
    logger.warn('[DB] PostgreSQL is offline or unreachable. Seamlessly operating with in-memory resilient fallback.');
    return false;
  }
};

export { prisma, isDbConnected };
