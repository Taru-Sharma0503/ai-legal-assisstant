import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as escalationApi from '../services/escalationApi.js';
import { getErrorMessage } from '../services/apiClient.js';
import ErrorMessage from './ErrorMessage.jsx';

export default function EscalationModal({ conversationId, onClose }) {
  const navigate = useNavigate();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('I need human assistance regarding this issue.');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const created = await escalationApi.createEscalation({ conversationId, subject, description });
      navigate(`/cases/${created.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Request Human Assistance</h2>
        <ErrorMessage message={error} />
        <div>
          <label className="label">Subject</label>
          <input className="input" required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Need help regarding property dispute" />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" rows={4} required value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={loading}>{loading ? 'Sending...' : 'Submit'}</button>
        </div>
      </form>
    </div>
  );
}