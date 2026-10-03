import { ApiError } from '../utils/apiError.js';

export const validate = (schema) => {
  return async (req, res, next) => {
    try {
      if (!schema) return next();

      // If schema is a ZodObject directly, validate req.body
      if (typeof schema.parseAsync === 'function' && !schema.body && !schema.query && !schema.params) {
        req.body = await schema.parseAsync(req.body);
        return next();
      }

      // If schema has body/query/params wrappers
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      if (schema.query) {
        req.query = await schema.query.parseAsync(req.query);
      }
      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params);
      }

      next();
    } catch (error) {
      if (error.errors && Array.isArray(error.errors)) {
        const details = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message
        }));
        return next(ApiError.validation('Invalid request data', details));
      }
      next(error);
    }
  };
};
