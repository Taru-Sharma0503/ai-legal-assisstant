import crypto from 'crypto';
import { prisma, isDbConnected } from '../../config/db.js';
import { ApiError } from '../../utils/apiError.js';
import { INITIAL_SERVICES } from '../services/service.service.js';

// In-memory fallback applications
const mockApplications = new Map();

export const generateReferenceNumber = () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  return `APP-${dateStr}-${randomSuffix}`;
};

export const createApplication = async (userId, { serviceId }) => {
  let service = null;
  if (prisma && isDbConnected) {
    try {
      service = await prisma.service.findUnique({
        where: { id: serviceId },
        include: { documents: true }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!service) {
    service = INITIAL_SERVICES.find(s => s.id === serviceId);
  }

  if (!service) {
    throw ApiError.notFound('Service not found');
  }

  const applicationId = crypto.randomUUID();
  const referenceNumber = generateReferenceNumber();
  const now = new Date();

  let createdApp = null;
  if (prisma && isDbConnected) {
    try {
      createdApp = await prisma.application.create({
        data: {
          id: applicationId,
          referenceNumber,
          userId,
          serviceId: service.id,
          status: 'DRAFT',
          applicationDate: now,
          documents: {
            create: (service.documents || []).map(doc => ({
              id: crypto.randomUUID(),
              name: doc.name,
              status: 'PENDING',
              fileUrl: null
            }))
          }
        }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!createdApp) {
    createdApp = {
      id: applicationId,
      referenceNumber,
      userId,
      serviceId: service.id,
      service: { id: service.id, name: service.name },
      status: 'DRAFT',
      applicationDate: now,
      updatedAt: now,
      documents: (service.documents || []).map(doc => ({
        id: crypto.randomUUID(),
        name: doc.name,
        status: 'PENDING',
        fileUrl: null
      }))
    };
    mockApplications.set(applicationId, createdApp);
  }

  return {
    id: createdApp.id,
    referenceNumber: createdApp.referenceNumber,
    serviceId: createdApp.serviceId,
    status: createdApp.status,
    applicationDate: createdApp.applicationDate instanceof Date ? createdApp.applicationDate.toISOString() : now.toISOString()
  };
};

export const getMyApplications = async (userId, { status, page = 1, limit = 10 }) => {
  let applications = [];
  let total = 0;

  if (prisma && isDbConnected) {
    try {
      const where = {
        userId,
        ...(status ? { status } : {})
      };

      total = await prisma.application.count({ where });
      const dbApps = await prisma.application.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { applicationDate: 'desc' },
        include: {
          service: {
            select: { id: true, name: true }
          }
        }
      });

      if (total > 0) {
        applications = dbApps;
      }
    } catch (err) {
      // fallback
    }
  }

  if (applications.length === 0 && total === 0) {
    let list = Array.from(mockApplications.values()).filter(a => a.userId === userId);
    if (status) {
      list = list.filter(a => a.status === status);
    }
    total = list.length;
    const startIndex = (page - 1) * limit;
    applications = list.slice(startIndex, startIndex + limit);
  }

  return {
    applications: applications.map(app => ({
      id: app.id,
      referenceNumber: app.referenceNumber,
      service: {
        id: app.service?.id || app.serviceId,
        name: app.service?.name || 'Government Service'
      },
      status: app.status,
      applicationDate: app.applicationDate instanceof Date ? app.applicationDate.toISOString() : app.applicationDate,
      updatedAt: app.updatedAt instanceof Date ? app.updatedAt.toISOString() : app.updatedAt
    })),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: Number(total),
      totalPages: Math.ceil(total / limit) || 1
    }
  };
};

export const getApplicationById = async (userId, applicationId) => {
  let app = null;

  if (prisma && isDbConnected) {
    try {
      app = await prisma.application.findFirst({
        where: { id: applicationId, userId },
        include: {
          service: { select: { id: true, name: true } },
          documents: {
            select: {
              id: true,
              name: true,
              status: true,
              fileUrl: true
            }
          }
        }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!app) {
    const mock = mockApplications.get(applicationId);
    if (mock && mock.userId === userId) {
      app = mock;
    }
  }

  if (!app) {
    throw ApiError.notFound('Application not found');
  }

  return {
    id: app.id,
    referenceNumber: app.referenceNumber,
    status: app.status,
    service: {
      id: app.service?.id || app.serviceId,
      name: app.service?.name || 'Government Service'
    },
    documents: (app.documents || []).map(d => ({
      id: d.id,
      name: d.name,
      status: d.status,
      fileUrl: d.fileUrl || null
    })),
    applicationDate: app.applicationDate instanceof Date ? app.applicationDate.toISOString() : app.applicationDate,
    updatedAt: app.updatedAt instanceof Date ? app.updatedAt.toISOString() : app.updatedAt
  };
};

export const uploadDocument = async (userId, applicationId, { documentName, fileUrl }) => {
  const app = await getApplicationById(userId, applicationId);

  const docId = crypto.randomUUID();
  const now = new Date();

  let updatedDoc = null;
  if (prisma && isDbConnected) {
    try {
      const existing = await prisma.applicationDocument.findFirst({
        where: { applicationId, name: documentName }
      });

      if (existing) {
        updatedDoc = await prisma.applicationDocument.update({
          where: { id: existing.id },
          data: {
            fileUrl,
            status: 'UPLOADED',
            updatedAt: now
          }
        });
      } else {
        updatedDoc = await prisma.applicationDocument.create({
          data: {
            id: docId,
            applicationId,
            name: documentName,
            fileUrl,
            status: 'UPLOADED',
            createdAt: now,
            updatedAt: now
          }
        });
      }

      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: 'UNDER_REVIEW',
          updatedAt: now
        }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!updatedDoc) {
    const mock = mockApplications.get(applicationId);
    if (mock) {
      const existingIdx = (mock.documents || []).findIndex(d => d.name === documentName);
      if (existingIdx >= 0) {
        mock.documents[existingIdx].fileUrl = fileUrl;
        mock.documents[existingIdx].status = 'UPLOADED';
        updatedDoc = mock.documents[existingIdx];
      } else {
        updatedDoc = {
          id: docId,
          name: documentName,
          fileUrl,
          status: 'UPLOADED'
        };
        mock.documents.push(updatedDoc);
      }
      mock.status = 'UNDER_REVIEW';
      mock.updatedAt = now;
    } else {
      updatedDoc = {
        id: docId,
        name: documentName,
        fileUrl,
        status: 'UPLOADED'
      };
    }
  }

  return {
    id: updatedDoc.id,
    documentName: updatedDoc.name,
    fileUrl: updatedDoc.fileUrl,
    status: updatedDoc.status
  };
};

// Owner of the application, or staff (ADMIN/AGENT), can open an uploaded file
export const canAccessFile = async (user, filename) => {
  const urlEnd = `/uploads/${filename}`;

  if (prisma && isDbConnected) {
    try {
      const doc = await prisma.applicationDocument.findFirst({
        where: { fileUrl: { endsWith: urlEnd } },
        include: { application: { select: { userId: true } } }
      });
      if (doc) {
        return user.role !== 'CITIZEN' || doc.application.userId === user.id;
      }
    } catch (err) {
      // fall through to the in-memory check
    }
  }

  for (const app of mockApplications.values()) {
    const hasFile = (app.documents || []).some(d => d.fileUrl && d.fileUrl.endsWith(urlEnd));
    if (hasFile) {
      return user.role !== 'CITIZEN' || app.userId === user.id;
    }
  }

  return false;
};