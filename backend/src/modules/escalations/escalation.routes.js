import { Router } from 'express';
import * as escalationController from './escalation.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import {
  createEscalationSchema,
  caseIdParamSchema,
  sendCaseMessageSchema
} from './escalation.schema.js';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  validate(createEscalationSchema),
  escalationController.createEscalation
);

router.get(
  '/',
  escalationController.getMyCases
);

router.get(
  '/:caseId',
  validate({ params: caseIdParamSchema }),
  escalationController.getCaseDetails
);

router.post(
  '/:caseId/messages',
  validate({
    params: caseIdParamSchema,
    body: sendCaseMessageSchema
  }),
  escalationController.sendCaseMessage
);

export default router;
