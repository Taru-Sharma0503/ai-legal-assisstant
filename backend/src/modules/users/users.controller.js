import * as usersService from './users.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const getProfile = async (req, res, next) => {
  try {
    const user = await usersService.getUserById(req.user.id);
    return sendSuccess(res, 200, user);
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const updated = await usersService.updateUserProfile(req.user.id, req.body);
    return sendSuccess(res, 200, updated, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
};
