import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma, isDbConnected } from '../../config/db.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/apiError.js';
import crypto from 'crypto';

// In-memory fallback users in case DB is offline during quick hackathon testing
const mockUsers = new Map();

export const register = async ({ name, email, password, preferredLanguage = 'hi' }) => {
  const normalizedEmail = email.toLowerCase().trim();

  let existingUser = null;
  if (prisma && isDbConnected) {
    try {
      existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });
    } catch (err) {
      existingUser = mockUsers.get(normalizedEmail);
    }
  } else {
    existingUser = mockUsers.get(normalizedEmail);
  }

  if (existingUser) {
    throw ApiError.conflict('User with this email already exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = crypto.randomUUID();
  let createdUser = null;

  if (prisma && isDbConnected) {
    try {
      createdUser = await prisma.user.create({
        data: {
          id: userId,
          name,
          email: normalizedEmail,
          password: hashedPassword,
          role: 'CITIZEN',
          preferredLanguage
        },
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

  if (!createdUser) {
    createdUser = {
      id: userId,
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: 'CITIZEN',
      preferredLanguage
    };
    mockUsers.set(normalizedEmail, createdUser);
  }

  const accessToken = jwt.sign(
    { sub: createdUser.id, role: createdUser.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  return {
    user: {
      id: createdUser.id,
      name: createdUser.name,
      email: createdUser.email,
      role: createdUser.role,
      preferredLanguage: createdUser.preferredLanguage
    },
    accessToken
  };
};

export const login = async ({ email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();
  let user = null;

  if (prisma && isDbConnected) {
    try {
      user = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });
    } catch (err) {
      user = mockUsers.get(normalizedEmail);
    }
  } else {
    user = mockUsers.get(normalizedEmail);
  }

  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const accessToken = jwt.sign(
    { sub: user.id, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      preferredLanguage: user.preferredLanguage
    },
    accessToken
  };
};

export const getMe = async (userId) => {
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
    } catch (err) {
      // Fallback
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
    throw ApiError.notFound('User not found');
  }

  return user;
};

export { mockUsers };
