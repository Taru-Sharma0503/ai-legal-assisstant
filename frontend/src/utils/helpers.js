export const homeFor = (role) => (role === 'CITIZEN' ? '/dashboard' : '/admin');

export const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const prettyStatus = (s = '') => s.replaceAll('_', ' ');

// Accepts [..] or { services: [..] } / { cases: [..] } etc. and always returns an array
export const toList = (data, ...keys) => {
  if (Array.isArray(data)) return data;
  if (!data) return [];
  for (const k of keys) if (Array.isArray(data[k])) return data[k];
  return [];
};