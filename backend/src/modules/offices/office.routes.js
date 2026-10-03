import { Router } from 'express';
import * as officeController from './office.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { officeQuerySchema } from './office.schema.js';

const router = Router();

router.get(
  '/',
  validate({ query: officeQuerySchema }),
  officeController.getOffices
);

export default router;
