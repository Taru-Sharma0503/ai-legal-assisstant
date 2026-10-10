import api, { unwrap } from './apiClient.js';

export const createApplication = (serviceId) => api.post('/applications', { serviceId }).then(unwrap);
export const getApplications = (params) => api.get('/applications', { params }).then(unwrap); // {applications, pagination}
export const getApplication = (id) => api.get(`/applications/${id}`).then(unwrap);

export const uploadDocument = (applicationId, documentName, file) => {
  const form = new FormData();
  form.append('documentName', documentName);
  form.append('file', file);
  // Don't set Content-Type manually: the browser adds the multipart boundary.
  return api.post(`/applications/${applicationId}/documents`, form).then(unwrap);
};