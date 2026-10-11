import { Router } from 'express';
import * as applicationController from './application.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { upload } from '../../utils/upload.js';
import {
  createApplicationSchema,
  applicationQuerySchema,
  applicationIdParamSchema,
  applicationDocParamsSchema,
  updateApplicationSchema,
  updateDocumentSchema
} from './application.schema.js';

const router = Router();

// All application endpoints require user authentication
router.use(authenticate);

router.post(
  '/',
  validate(createApplicationSchema),
  applicationController.createApplication
);

router.get(
  '/',
  validate({ query: applicationQuerySchema }),
  applicationController.getMyApplications
);

router.get(
  '/:applicationId',
  validate({ params: applicationIdParamSchema }),
  applicationController.getApplicationDetails
);

router.patch(
  '/:applicationId',
  validate({
    params: applicationIdParamSchema,
    body: updateApplicationSchema
  }),
  applicationController.updateApplication
);

router.post(
  '/:applicationId/documents',
  validate({ params: applicationIdParamSchema }),
  upload.single('file'),
  applicationController.uploadDocument
);

router.patch(
  '/:applicationId/submit',
  validate({ params: applicationIdParamSchema }),
  applicationController.submitApplication
);

router.patch(
  '/:applicationId/withdraw',
  validate({ params: applicationIdParamSchema }),
  applicationController.withdrawApplication
);

router.patch(
  '/:applicationId/documents/:documentId',
  validate({
    params: applicationDocParamsSchema,
    body: updateDocumentSchema
  }),
  applicationController.updateDocument
);

router.delete(
  '/:applicationId/documents/:documentId',
  validate({ params: applicationDocParamsSchema }),
  applicationController.deleteDocument
);

export default router;

