import api, { unwrap } from './apiClient.js';

export const getDashboard = () => api.get('/dashboard').then(unwrap);