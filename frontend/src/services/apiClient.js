import axios from 'axios';
import { TOKEN_KEY, USER_KEY } from '../utils/constants.js';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30000, // AI answers can take a while
});

// Attach JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global 401 handling (expired/invalid token)
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const url = error.config?.url || '';
    const isAuthCall = /\/auth\/(login|register)/.test(url);
    if (error.response?.status === 401 && !isAuthCall) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Backend always responds { success, data }  → return just data
export const unwrap = (res) => res.data.data;

// Backend error contract: { success:false, error:{ code, message, details:[{field,message}] } }
export function getErrorMessage(err) {
  const e = err?.response?.data?.error;
  if (e?.details?.length) return e.details.map((d) => d.message).join(', ');
  if (e?.message) return e.message;
  if (err?.code === 'ECONNABORTED') return 'Request timed out. Please try again.';
  if (!err?.response) return 'Cannot reach the server. Check your connection.';
  return err?.message || 'Something went wrong';
}

export default api;