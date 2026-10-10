
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


export const createApplication = async (
  userId,
  { serviceId, applicantDetails = {} }
) => {
  let service = null;

  if (prisma && isDbConnected) {
    try {
      service = await prisma.service.findUnique({
        where: { id: serviceId },
        include: { documents: true }
      });
    } catch (err) {
      // Use fallback data if the database query fails.
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

  // Convert the form data into database-compatible values.
  const details = {
    applicantName:
      applicantDetails.fullName || applicantDetails.applicantName || null,

    applicantDateOfBirth: applicantDetails.dateOfBirth
      ? new Date(applicantDetails.dateOfBirth)
      : null,

    applicantGender:
      applicantDetails.gender || null,

    applicantMobile:
      applicantDetails.mobile || null,

    applicantEmail:
      applicantDetails.email || null,

    applicantAddress:
      applicantDetails.address || null,

    annualIncome:
      applicantDetails.annualIncome !== undefined &&
      applicantDetails.annualIncome !== ''
        ? Number(applicantDetails.annualIncome)
        : null,

    occupation:
      applicantDetails.occupation || null,

    incomeSource:
      applicantDetails.incomeSource || null
  };

  // Validate optional date and income values before saving.
  if (
    details.applicantDateOfBirth &&
    Number.isNaN(details.applicantDateOfBirth.getTime())
  ) {
    throw ApiError.badRequest('Please provide a valid date of birth.');
  }

  if (
    details.annualIncome !== null &&
    (!Number.isFinite(details.annualIncome) ||
      details.annualIncome < 0)
  ) {
    throw ApiError.badRequest('Please provide a valid annual income.');
  }

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
          ...details,
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
      // Preserve the existing in-memory fallback behavior.
      console.error('Failed to create application in database:', err);
      throw err;
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
      ...details,
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
    applicationDate:
      createdApp.applicationDate instanceof Date
        ? createdApp.applicationDate.toISOString()
        : now.toISOString()
  };
};


export const getMyApplications = async (
  userId,
  { status, page = 1, limit = 10 }
) => {
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
      // Use in-memory fallback if the database query fails.
    }
  }

  if (applications.length === 0 && total === 0) {
    let list = Array.from(mockApplications.values()).filter(
      app => app.userId === userId
    );

    if (status) {
      list = list.filter(app => app.status === status);
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
      applicationDate:
        app.applicationDate instanceof Date
          ? app.applicationDate.toISOString()
          : app.applicationDate,
      updatedAt:
        app.updatedAt instanceof Date
          ? app.updatedAt.toISOString()
          : app.updatedAt
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
      console.error('Failed to fetch application details:', err);
      throw err;
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

    // Applicant details
    applicantDetails: {
      fullName: app.applicantName || '',
      dateOfBirth: app.applicantDateOfBirth
        ? new Date(app.applicantDateOfBirth).toISOString().slice(0, 10)
        : '',
      gender: app.applicantGender || '',
      mobile: app.applicantMobile || '',
      email: app.applicantEmail || '',
      address: app.applicantAddress || '',
      annualIncome: app.annualIncome ?? null,
      occupation: app.occupation || '',
      incomeSource: app.incomeSource || ''
    },

    documents: (app.documents || []).map(doc => ({
      id: doc.id,
      name: doc.name,
      status: doc.status,
      fileUrl: doc.fileUrl || null
    })),

    applicationDate:
      app.applicationDate instanceof Date
        ? app.applicationDate.toISOString()
        : app.applicationDate,

    updatedAt:
      app.updatedAt instanceof Date
        ? app.updatedAt.toISOString()
        : app.updatedAt
  };
};

// Submit an application after checking its status and documents.
export const submitApplication = async (userId, applicationId) => {
  // This also verifies that the application belongs to this user.
  const app = await getApplicationById(userId, applicationId);

  if (app.status !== 'DRAFT') {
    throw ApiError.badRequest(
      'Only draft applications can be submitted.'
    );
  }

  const pendingDocuments = app.documents.filter(
    doc => doc.status !== 'UPLOADED'
  );

  if (pendingDocuments.length > 0) {
    const names = pendingDocuments.map(doc => doc.name).join(', ');

    throw ApiError.badRequest(
      `Please upload all required documents before submitting: ${names}`
    );
  }

  const now = new Date();

  // Update the database application.
  if (prisma && isDbConnected && !mockApplications.has(applicationId)) {
    const result = await prisma.application.updateMany({
      where: {
        id: applicationId,
        userId,
        status: 'DRAFT'
      },
      data: {
        status: 'SUBMITTED',
        updatedAt: now
      }
    });

    if (result.count !== 1) {
      throw ApiError.badRequest(
        'The application could not be submitted. Please refresh and try again.'
      );
    }
  } else {
    // Update the in-memory fallback application.
    const mock = mockApplications.get(applicationId);

    if (!mock || mock.userId !== userId) {
      throw ApiError.notFound('Application not found');
    }

    mock.status = 'SUBMITTED';
    mock.updatedAt = now;
  }

  return getApplicationById(userId, applicationId);
};

export const uploadDocument = async (
  userId,
  applicationId,
  { documentName, fileUrl }
) => {
  const app = await getApplicationById(userId, applicationId);

  if (app.status !== 'DRAFT') {
    throw ApiError.badRequest(
      'Documents can only be uploaded to draft applications.'
    );
  }

  const docId = crypto.randomUUID();
  const now = new Date();

  let updatedDoc = null;

  if (prisma && isDbConnected && !mockApplications.has(applicationId)) {
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
    } catch (err) {
      // Handle the upload using the fallback below if necessary.
    }
  }

  if (!updatedDoc) {
    const mock = mockApplications.get(applicationId);

    if (mock) {
      const existingIdx = (mock.documents || []).findIndex(
        doc => doc.name === documentName
      );

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

      // Uploading a document must not submit the application.
      mock.updatedAt = now;
    } else {
      throw ApiError.badRequest(
        'The document could not be saved. Please try again.'
      );
    }
  }

  return {
    id: updatedDoc.id,
    documentName: updatedDoc.name,
    fileUrl: updatedDoc.fileUrl,
    status: updatedDoc.status
  };
};

// Owner of the application, or staff (ADMIN/AGENT), can open an uploaded file.
export const canAccessFile = async (user, filename) => {
  const urlEnd = `/uploads/${filename}`;

  if (prisma && isDbConnected) {
    try {
      const doc = await prisma.applicationDocument.findFirst({
        where: { fileUrl: { endsWith: urlEnd } },
        include: {
          application: {
            select: { userId: true }
          }
        }
      });

      if (doc) {
        return user.role !== 'CITIZEN' ||
          doc.application.userId === user.id;
      }
    } catch (err) {
      // Fall through to the in-memory check.
    }
  }

  for (const app of mockApplications.values()) {
    const hasFile = (app.documents || []).some(
      doc => doc.fileUrl && doc.fileUrl.endsWith(urlEnd)
    );

    if (hasFile) {
      return user.role !== 'CITIZEN' || app.userId === user.id;
    }
  }

  return false;
};
