import api, { unwrap } from './apiClient.js';

export const getCases = (params) => api.get('/admin/escalations', { params }).then(unwrap);
export const getCase = (id) => api.get(`/admin/escalations/${id}`).then(unwrap);
export const updateCaseStatus = (id, status) => api.patch(`/admin/escalations/${id}`, { status }).then(unwrap);
export const replyToCase = (id, message) => api.post(`/admin/escalations/${id}/messages`, { message }).then(unwrap);

export const createService = (payload) => api.post('/admin/services', payload).then(unwrap);
export const updateService = (id, payload) => api.patch(`/admin/services/${id}`, payload).then(unwrap);
export const deactivateService = (id) => api.delete(`/admin/services/${id}`).then(unwrap);