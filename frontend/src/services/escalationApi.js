import api, { unwrap } from './apiClient.js';

export const createEscalation = (payload) => api.post('/escalations', payload).then(unwrap); // {conversationId, subject, description}
export const getEscalations = () => api.get('/escalations').then(unwrap);
export const getEscalation = (id) => api.get(`/escalations/${id}`).then(unwrap);
export const sendCaseMessage = (id, message) => api.post(`/escalations/${id}/messages`, { message }).then(unwrap);