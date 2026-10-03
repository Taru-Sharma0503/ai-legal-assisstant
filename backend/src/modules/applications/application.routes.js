import { Router } from 'express';
import * as applicationController from './application.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { upload } from '../../utils/upload.js';
import {
  createApplicationSchema,
  applicationQuerySchema,
  applicationIdParamSchema
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

router.post(
  '/:applicationId/documents',
  validate({ params: applicationIdParamSchema }),
  upload.single('file'),
  applicationController.uploadDocument
);

export default router;
