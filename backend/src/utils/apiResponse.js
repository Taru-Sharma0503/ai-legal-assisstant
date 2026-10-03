export const sendSuccess = (res, statusCode = 200, data = null, message = null) => {
  const payload = { success: true };
  if (message) {
    payload.message = message;
  }
  if (data !== null && data !== undefined) {
    payload.data = data;
  }
  return res.status(statusCode).json(payload);
};

export const sendError = (res, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', message = 'Internal server error', details = []) => {
  const payload = {
    success: false,
    error: {
      code,
      message,
      details
    }
  };
  return res.status(statusCode).json(payload);
};
