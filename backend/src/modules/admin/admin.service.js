import crypto from 'crypto';
import { prisma, isDbConnected } from '../../config/db.js';
import { ApiError } from '../../utils/apiError.js';
import { cacheDel, cacheDelPattern } from '../../config/redis.js';
import * as escalationService from '../escalations/escalation.service.js';
import { INITIAL_SERVICES } from '../services/service.service.js';

export const getEscalationQueue = async ({ status, page = 1, limit = 10 }) => {
  let escalations = [];
  let total = 0;

  if (prisma && isDbConnected) {
    try {
      const where = status ? { status } : {};
      total = await prisma.escalation.count({ where });
      const dbEscs = await prisma.escalation.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { messages: true } }
        }
      });
      if (total > 0) {
        escalations = dbEscs;
      }
    } catch (err) {
      // fallback
    }
  }

  return {
    escalations: escalations.map(esc => ({
      id: esc.id,
      subject: esc.subject,
      status: esc.status,
      citizen: {
        id: esc.user?.id || esc.userId,
        name: esc.user?.name || 'Citizen User',
        email: esc.user?.email || ''
      },
      messageCount: esc._count?.messages || (esc.messages || []).length,
      createdAt: esc.createdAt instanceof Date ? esc.createdAt.toISOString() : esc.createdAt,
      updatedAt: esc.updatedAt instanceof Date ? esc.updatedAt.toISOString() : esc.updatedAt
    })),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: Number(total),
      totalPages: Math.ceil(total / limit) || 1
    }
  };
};

export const getAdminCaseById = async (caseId) => {
  return escalationService.getCaseById(null, caseId, 'AGENT');
};

export const updateCaseStatus = async (caseId, status) => {
  const allowed = ['PENDING', 'IN_REVIEW', 'RESPONDED', 'RESOLVED', 'CLOSED'];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(`Invalid status. Allowed values: ${allowed.join(', ')}`);
  }

  const now = new Date();
  let updatedCase = null;

  if (prisma && isDbConnected) {
    try {
      updatedCase = await prisma.escalation.update({
        where: { id: caseId },
        data: {
          status,
          updatedAt: now
        },
        select: {
          id: true,
          status: true,
          updatedAt: true
        }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!updatedCase) {
    updatedCase = {
      id: caseId,
      status,
      updatedAt: now
    };
  }

  return {
    id: updatedCase.id,
    status: updatedCase.status,
    updatedAt: updatedCase.updatedAt instanceof Date ? updatedCase.updatedAt.toISOString() : now.toISOString()
  };
};

export const adminReply = async (agentId, caseId, { message }) => {
  return escalationService.sendCaseMessage(agentId, caseId, 'AGENT', { message });
};

export const createService = async ({
  name,
  department,
  description,
  eligibility,
  applicationMethod,
  governmentPortalUrl,
  region,
  documents = []
}) => {
  const serviceId = crypto.randomUUID();
  let createdService = null;

  if (prisma && isDbConnected) {
    try {
      createdService = await prisma.service.create({
        data: {
          id: serviceId,
          name,
          department,
          description,
          eligibility,
          applicationMethod,
          governmentPortalUrl,
          region,
          isActive: true,
          documents: {
            create: documents.map(d => ({
              id: crypto.randomUUID(),
              name: d.name,
              description: d.description || '',
              mandatory: d.mandatory !== undefined ? d.mandatory : true
            }))
          }
        },
        include: { documents: true }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!createdService) {
    createdService = {
      id: serviceId,
      name,
      department,
      description,
      eligibility,
      applicationMethod,
      governmentPortalUrl,
      region,
      isActive: true,
      documents
    };
    INITIAL_SERVICES.push(createdService);
  }

  await cacheDelPattern('services:*');
  return createdService;
};

export const updateService = async (serviceId, updateData) => {
  let updated = null;

  if (prisma && isDbConnected) {
    try {
      updated = await prisma.service.update({
        where: { id: serviceId },
        data: updateData,
        include: { documents: true }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!updated) {
    const existing = INITIAL_SERVICES.find(s => s.id === serviceId);
    if (existing) {
      Object.assign(existing, updateData);
      updated = existing;
    }
  }

  if (!updated) {
    throw ApiError.notFound('Service not found');
  }

  await cacheDel(`service:${serviceId}`);
  await cacheDelPattern('services:*');

  return updated;
};

export const deactivateService = async (serviceId) => {
  let updated = null;

  if (prisma && isDbConnected) {
    try {
      updated = await prisma.service.update({
        where: { id: serviceId },
        data: { isActive: false }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!updated) {
    const existing = INITIAL_SERVICES.find(s => s.id === serviceId);
    if (existing) {
      existing.isActive = false;
      updated = existing;
    }
  }

  if (!updated) {
    throw ApiError.notFound('Service not found');
  }

  await cacheDel(`service:${serviceId}`);
  await cacheDelPattern('services:*');

  return { message: 'Service deactivated successfully' };
};
