import { ApiError } from '../utils/apiError.js';

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Access forbidden: Role '${req.user.role}' is not authorized to access this resource`));
    }

    next();
  };
};
