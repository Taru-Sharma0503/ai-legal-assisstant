import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let redisClient = null;
let isConnected = false;

// Fallback in-memory cache and rate limit store
const inMemoryCache = new Map();
const inMemoryExpiry = new Map();
const inMemoryRateLimits = new Map();

try {
  redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    enableOfflineQueue: false,
    retryStrategy(times) {
      if (times > 3) {
        return null; // Stop retrying after 3 attempts, switch gracefully to memory fallback
      }
      return Math.min(times * 500, 2000);
    }
  });

  redisClient.on('connect', () => {
    isConnected = true;
    logger.info('[Redis] Connected successfully');
  });

  redisClient.on('error', (err) => {
    isConnected = false;
    logger.warn(`[Redis] Connection warning: ${err.message}. Using in-memory fallback.`);
  });
} catch (err) {
  isConnected = false;
  logger.warn(`[Redis] Failed to initialize: ${err.message}. Using in-memory fallback.`);
}

export const cacheGet = async (key) => {
  if (isConnected && redisClient) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      logger.warn(`[Redis] get error on key ${key}: ${err.message}`);
    }
  }

  // In-memory fallback
  const expiry = inMemoryExpiry.get(key);
  if (expiry && Date.now() > expiry) {
    inMemoryCache.delete(key);
    inMemoryExpiry.delete(key);
    return null;
  }
  return inMemoryCache.get(key) || null;
};

export const cacheSet = async (key, value, ttlSeconds = 300) => {
  const serialized = JSON.stringify(value);
  if (isConnected && redisClient) {
    try {
      if (ttlSeconds) {
        await redisClient.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await redisClient.set(key, serialized);
      }
      return;
    } catch (err) {
      logger.warn(`[Redis] set error on key ${key}: ${err.message}`);
    }
  }

  // In-memory fallback
  inMemoryCache.set(key, value);
  if (ttlSeconds) {
    inMemoryExpiry.set(key, Date.now() + ttlSeconds * 1000);
  }
};

export const cacheDel = async (key) => {
  if (isConnected && redisClient) {
    try {
      await redisClient.del(key);
    } catch (err) {
      logger.warn(`[Redis] del error on key ${key}: ${err.message}`);
    }
  }
  inMemoryCache.delete(key);
  inMemoryExpiry.delete(key);
};

export const cacheDelPattern = async (pattern) => {
  if (isConnected && redisClient) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (err) {
      logger.warn(`[Redis] delPattern error: ${err.message}`);
    }
  }

  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  for (const key of inMemoryCache.keys()) {
    if (regex.test(key)) {
      inMemoryCache.delete(key);
      inMemoryExpiry.delete(key);
    }
  }
};

export const incrementRateLimit = async (key, windowSeconds = 60) => {
  if (isConnected && redisClient) {
    try {
      const current = await redisClient.incr(key);
      if (current === 1) {
        await redisClient.expire(key, windowSeconds);
      }
      const ttl = await redisClient.ttl(key);
      return { count: current, ttl: ttl > 0 ? ttl : windowSeconds };
    } catch (err) {
      logger.warn(`[Redis] rate limit error: ${err.message}`);
    }
  }

  // In-memory rate limiting fallback
  const now = Date.now();
  const entry = inMemoryRateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    inMemoryRateLimits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { count: 1, ttl: windowSeconds };
  }

  entry.count += 1;
  const remainingSeconds = Math.ceil((entry.resetAt - now) / 1000);
  return { count: entry.count, ttl: remainingSeconds };
};

export { redisClient, isConnected };
