import { Router } from 'express';
import path from 'path';
import { authenticate } from '../../middleware/auth.middleware.js';
import { ApiError } from '../../utils/apiError.js';
import { canAccessFile } from './application.service.js';

const router = Router();
const uploadDir = path.resolve(process.cwd(), 'uploads');

router.get('/:filename', authenticate, async (req, res, next) => {
  try {
    const { filename } = req.params;

    // Only names created by our upload middleware, e.g. doc-1791049133413-358567823.pdf
    if (!/^doc-\d+-\d+\.[a-z0-9]+$/.test(filename)) {
      throw ApiError.notFound('File not found');
    }

    const allowed = await canAccessFile(req.user, filename);
    if (!allowed) {
      throw ApiError.notFound('File not found');
    }

    res.sendFile(path.join(uploadDir, filename), (err) => {
      if (err && !res.headersSent) next(ApiError.notFound('File not found'));
    });
  } catch (error) {
    next(error);
  }
});

export default router;