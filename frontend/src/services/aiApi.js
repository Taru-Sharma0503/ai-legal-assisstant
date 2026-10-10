import api, { unwrap } from './apiClient.js';

export const createConversation = ({ language, title = null }) =>
  api.post('/ai/conversations', { language, title }).then(unwrap); // {conversationId,...}

export const getConversations = () => api.get('/ai/conversations').then(unwrap); // []

export const getConversation = (id) => api.get(`/ai/conversations/${id}`).then(unwrap); // {id,title,language,messages[]}

export const sendMessage = (id, { message, language }) =>
  api.post(`/ai/conversations/${id}/messages`, { message, language }).then(unwrap);
// → {messageId, answer, language, confidence, needsHuman, sources[], suggestedService}