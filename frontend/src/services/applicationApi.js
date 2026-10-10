
import api, { unwrap } from './apiClient.js';

export const createApplication = (serviceId, applicantDetails = {}) =>
  api
    .post('/applications', { serviceId, applicantDetails })
    .then(unwrap);

export const getApplications = (params) =>
  api.get('/applications', { params }).then(unwrap);

export const getApplication = (id) =>
  api.get(`/applications/${id}`).then(unwrap);

export const submitApplication = (applicationId) =>
  api.post(`/applications/${applicationId}/submit`).then(unwrap);

export const uploadDocument = (applicationId, documentName, file) => {
  const form = new FormData();
  form.append('documentName', documentName);
  form.append('file', file);

  // The browser adds the multipart boundary automatically.
  return api
    .post(`/applications/${applicationId}/documents`, form)
    .then(unwrap);
};
