import api, { unwrap } from './apiClient.js';

export const register = (payload) => api.post('/auth/register', payload).then(unwrap); // {user, accessToken}
export const login = (payload) => api.post('/auth/login', payload).then(unwrap); // {user, accessToken}
export const me = () => api.get('/auth/me').then(unwrap); // user