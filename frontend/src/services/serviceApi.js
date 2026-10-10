import api, { unwrap } from './apiClient.js';

export const searchServices = (params) => api.get('/services', { params }).then(unwrap); // {services, pagination}
export const getService = (id) => api.get(`/services/${id}`).then(unwrap);
export const getChecklist = (id) => api.get(`/services/${id}/checklist`).then(unwrap);
export const searchOffices = (params) => api.get('/offices', { params }).then(unwrap); // []