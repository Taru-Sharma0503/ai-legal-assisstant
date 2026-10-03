import { Router } from 'express';
import * as serviceController from './service.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { serviceQuerySchema, serviceIdParamSchema } from './service.schema.js';

const router = Router();

router.get(
  '/',
  validate({ query: serviceQuerySchema }),
  serviceController.searchServices
);

router.get(
  '/:serviceId',
  validate({ params: serviceIdParamSchema }),
  serviceController.getServiceDetails
);

router.get(
  '/:serviceId/checklist',
  validate({ params: serviceIdParamSchema }),
  serviceController.getServiceChecklist
);

export default router;
