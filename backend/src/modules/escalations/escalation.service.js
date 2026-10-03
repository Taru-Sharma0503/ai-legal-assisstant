import crypto from 'crypto';
import { prisma, isDbConnected } from '../../config/db.js';
import { ApiError } from '../../utils/apiError.js';

// In-memory fallback cases
const mockEscalations = new Map();

export const createEscalation = async (userId, { conversationId, subject, description }) => {
  const caseId = crypto.randomUUID();
  const now = new Date();

  let escalation = null;
  if (prisma && isDbConnected) {
    try {
      escalation = await prisma.escalation.create({
        data: {
          id: caseId,
          userId,
          conversationId: conversationId || null,
          subject,
          description,
          status: 'PENDING',
          createdAt: now,
          updatedAt: now
        }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!escalation) {
    escalation = {
      id: caseId,
      userId,
      conversationId: conversationId || null,
      subject,
      description,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
      messages: []
    };
    mockEscalations.set(caseId, escalation);
  }

  return {
    id: escalation.id,
    status: escalation.status,
    subject: escalation.subject,
    createdAt: escalation.createdAt instanceof Date ? escalation.createdAt.toISOString() : now.toISOString()
  };
};

export const getMyCases = async (userId) => {
  let list = [];

  if (prisma && isDbConnected) {
    try {
      list = await prisma.escalation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          subject: true,
          status: true,
          createdAt: true,
          updatedAt: true
        }
      });
    } catch (err) {
      // fallback
    }
  }

  if (list.length === 0) {
    for (const esc of mockEscalations.values()) {
      if (esc.userId === userId) {
        list.push({
          id: esc.id,
          subject: esc.subject,
          status: esc.status,
          createdAt: esc.createdAt,
          updatedAt: esc.updatedAt
        });
      }
    }
  }

  return list.map(c => ({
    id: c.id,
    subject: c.subject,
    status: c.status,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt
  }));
};

export const getCaseById = async (userId, caseId, userRole = 'CITIZEN') => {
  let escalation = null;

  if (prisma && isDbConnected) {
    try {
      const where = userRole === 'CITIZEN' ? { id: caseId, userId } : { id: caseId };
      escalation = await prisma.escalation.findFirst({
        where,
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              senderRole: true,
              message: true,
              createdAt: true
            }
          }
        }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!escalation) {
    const mock = mockEscalations.get(caseId);
    if (mock && (userRole !== 'CITIZEN' || mock.userId === userId)) {
      escalation = mock;
    }
  }

  if (!escalation) {
    throw ApiError.notFound('Case not found');
  }

  return {
    id: escalation.id,
    subject: escalation.subject,
    description: escalation.description,
    status: escalation.status,
    messages: (escalation.messages || []).map(m => ({
      id: m.id,
      senderRole: m.senderRole,
      message: m.message,
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt
    }))
  };
};

export const sendCaseMessage = async (userId, caseId, userRole, { message }) => {
  const escalation = await getCaseById(userId, caseId, userRole);

  const messageId = crypto.randomUUID();
  const now = new Date();
  const senderRole = userRole === 'ADMIN' || userRole === 'AGENT' ? 'AGENT' : 'CITIZEN';

  let createdMessage = null;
  if (prisma && isDbConnected) {
    try {
      createdMessage = await prisma.escalationMessage.create({
        data: {
          id: messageId,
          escalationId: caseId,
          senderId: userId,
          senderRole,
          message,
          createdAt: now
        }
      });

      const newStatus = senderRole === 'AGENT' ? 'RESPONDED' : escalation.status;
      await prisma.escalation.update({
        where: { id: caseId },
        data: {
          status: newStatus,
          updatedAt: now
        }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!createdMessage) {
    createdMessage = {
      id: messageId,
      senderRole,
      message,
      createdAt: now
    };
    const mock = mockEscalations.get(caseId);
    if (mock) {
      if (!mock.messages) mock.messages = [];
      mock.messages.push(createdMessage);
      if (senderRole === 'AGENT') {
        mock.status = 'RESPONDED';
      }
      mock.updatedAt = now;
    }
  }

  return {
    id: createdMessage.id,
    senderRole: createdMessage.senderRole,
    message: createdMessage.message,
    createdAt: createdMessage.createdAt instanceof Date ? createdMessage.createdAt.toISOString() : now.toISOString()
  };
};
