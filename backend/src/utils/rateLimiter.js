import { incrementRateLimit } from '../config/redis.js';
import { ApiError } from './apiError.js';
import { env } from '../config/env.js';

export const createRateLimiter = ({
  max = env.RATE_LIMIT_AI_MAX,
  windowSeconds = env.RATE_LIMIT_AI_WINDOW_SECONDS,
  keyPrefix = 'user'
} = {}) => {
  return async (req, res, next) => {
    try {
      const identifier = req.user?.id || req.ip || 'anonymous';
      const key = `${keyPrefix}:${identifier}:ai_requests`;

      const { count, ttl } = await incrementRateLimit(key, windowSeconds);

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
      res.setHeader('X-RateLimit-Reset', ttl);

      if (count > max) {
        throw ApiError.rateLimited(`Rate limit exceeded. Maximum ${max} AI requests per ${windowSeconds} seconds. Please wait ${ttl} seconds.`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
