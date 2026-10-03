import * as authService from './auth.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const register = async (req, res, next) => {
  try {
    const { name, email, password, preferredLanguage } = req.body;
    const result = await authService.register({ name, email, password, preferredLanguage });
    return sendSuccess(res, 201, result, 'Registration successful');
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });
    return sendSuccess(res, 200, result);
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user.id);
    return sendSuccess(res, 200, user);
  } catch (error) {
    next(error);
  }
};
