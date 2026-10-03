import { prisma } from '../../config/db.js';
import { ApiError } from '../../utils/apiError.js';

export const getUserById = async (userId) => {
  let user = null;
  if (prisma) {
    try {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          preferredLanguage: true,
          createdAt: true
        }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  return user;
};

export const updateUserProfile = async (userId, data) => {
  let user = null;
  if (prisma) {
    try {
      user = await prisma.user.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          preferredLanguage: true
        }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  return user;
};
