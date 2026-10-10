export const TOKEN_KEY = 'accessToken';
export const USER_KEY = 'user';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
];

export const APPLICATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_VERIFICATION',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
];

export const CASE_STATUSES = ['PENDING', 'IN_REVIEW', 'RESPONDED', 'RESOLVED', 'CLOSED'];

export const APPLICATION_METHODS = ['ONLINE', 'OFFLINE', 'BOTH'];

export const MAX_UPLOAD_MB = 5;
export const ALLOWED_UPLOAD_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];