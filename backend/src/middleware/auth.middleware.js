import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { prisma, isDbConnected } from '../config/db.js';
import { mockUsers } from '../modules/auth/auth.service.js';

const userFields = {
  id: true,
  name: true,
  email: true,
  role: true,
  preferredLanguage: true
};

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
      decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      throw ApiError.unauthorized('Invalid or expired authentication token');
    }

    const userId = decoded.sub;
    if (!userId) {
      throw ApiError.unauthorized('Invalid token payload');
    }

    // The user must exist. The role always comes from the DB, never from the token.
    let user = null;
    if (prisma && isDbConnected) {
      try {
        user = await prisma.user.findUnique({ where: { id: userId }, select: userFields });
      } catch (dbErr) {
        // fall through to the in-memory store
      }
    }

    if (!user) {
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
      throw ApiError.unauthorized('User no longer exists');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};