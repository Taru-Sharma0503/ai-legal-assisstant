import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'Internal server error';
  let details = [];

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details || [];
  } else if (err.name === 'ZodError') {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Invalid request data';
    details = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message
    }));
  } else if (err.code === 'P2002') { // Prisma unique constraint violation
    statusCode = 409;
    code = 'CONFLICT';
    message = 'A record with this unique field already exists';
    const targets = err.meta?.target ? (Array.isArray(err.meta.target) ? err.meta.target.join(', ') : err.meta.target) : 'field';
    details = [{ field: targets, message: `Unique constraint violated on ${targets}` }];
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = 'Invalid or expired token';
  } else if (err.type === 'entity.parse.failed') { // Malformed JSON in body
    statusCode = 400;
    code = 'BAD_REQUEST';
    message = 'Malformed JSON body in request';
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    code = 'BAD_REQUEST';
    message = 'File size exceeds maximum allowed limit';
  }

  if (statusCode >= 500) {
    logger.error(`[Unhandled Error] ${req.method} ${req.originalUrl}:`, err);
  } else {
    logger.warn(`[Client Error ${statusCode}] ${req.method} ${req.originalUrl}: ${message}`);
  }

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details
    }
  });
};

export const notFoundHandler = (req, res, next) => {
  next(ApiError.notFound(`Endpoint not found: ${req.method} ${req.originalUrl}`));
};
