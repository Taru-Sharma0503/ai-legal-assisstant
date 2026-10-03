import { Router } from 'express';
import * as adminController from './admin.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorizeRoles } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { caseIdParamSchema } from '../escalations/escalation.schema.js';
import { serviceIdParamSchema } from '../services/service.schema.js';
import {
  updateCaseStatusSchema,
  adminReplySchema,
  createServiceSchema,
  updateServiceSchema,
  adminCaseQuerySchema
} from './admin.schema.js';

const router = Router();

// Base middleware: All admin endpoints require authentication
router.use(authenticate);

// Escalation management routes (accessible by ADMIN and AGENT)
router.get(
  '/escalations',
  authorizeRoles('ADMIN', 'AGENT'),
  validate({ query: adminCaseQuerySchema }),
  adminController.getEscalationQueue
);

router.get(
  '/escalations/:caseId',
  authorizeRoles('ADMIN', 'AGENT'),
  validate({ params: caseIdParamSchema }),
  adminController.getCaseDetails
);

router.patch(
  '/escalations/:caseId',
  authorizeRoles('ADMIN', 'AGENT'),
  validate({
    params: caseIdParamSchema,
    body: updateCaseStatusSchema
  }),
  adminController.updateCaseStatus
);

router.post(
  '/escalations/:caseId/messages',
  authorizeRoles('ADMIN', 'AGENT'),
  validate({
    params: caseIdParamSchema,
    body: adminReplySchema
  }),
  adminController.replyToCase
);

// Service catalogue management routes (accessible strictly by ADMIN)
router.post(
  '/services',
  authorizeRoles('ADMIN'),
  validate({ body: createServiceSchema }),
  adminController.createService
);

router.patch(
  '/services/:serviceId',
  authorizeRoles('ADMIN'),
  validate({
    params: serviceIdParamSchema,
    body: updateServiceSchema
  }),
  adminController.updateService
);

router.delete(
  '/services/:serviceId',
  authorizeRoles('ADMIN'),
  validate({ params: serviceIdParamSchema }),
  adminController.deactivateService
);

export default router;
