import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env.js';
import { ApiError } from './apiError.js';

const uploadDirectory = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `doc-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = env.ALLOWED_FILE_EXTENSIONS.map(ext => ext.toLowerCase());
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');

  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (!allowedExtensions.includes(ext)) {
    return cb(ApiError.badRequest(`File extension .${ext} is not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`));
  }

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(ApiError.badRequest(`File MIME type ${file.mimetype} is not allowed.`));
  }

  cb(null, true);
};

export const upload = multer({
  storage,
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 // e.g. 10MB
  },
  fileFilter
});

export const getFileUrl = (req, filename) => {
  return `${env.BASE_URL}/uploads/${filename}`;
};
