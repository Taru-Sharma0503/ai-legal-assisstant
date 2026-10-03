import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { prisma, isDbConnected } from '../config/db.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Authentication token is required');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw ApiError.unauthorized('Authentication token is required');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      throw ApiError.unauthorized('Invalid or expired authentication token');
    }

    const userId = decoded.sub || decoded.id;
    if (!userId) {
      throw ApiError.unauthorized('Invalid token payload');
    }

    let user = null;
    if (prisma && isDbConnected) {
      try {
        user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            preferredLanguage: true
          }
        });
      } catch (dbErr) {
        // Fallback
      }
    }

    if (!user) {
      const { mockUsers } = await import('../modules/auth/auth.service.js');
      for (const u of mockUsers.values()) {
        if (u.id === userId) {
          user = {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            preferredLanguage: u.preferredLanguage
          };
          break;
        }
      }
    }

    if (!user) {
      user = {
        id: userId,
        role: decoded.role || 'CITIZEN',
        name: decoded.name || 'Taru Sharma',
        email: decoded.email || '',
        preferredLanguage: decoded.preferredLanguage || 'hi'
      };
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
