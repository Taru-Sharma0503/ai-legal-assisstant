import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import useFetch from '../../hooks/useFetch.js';
import * as adminApi from '../../services/adminApi.js';
import { getErrorMessage } from '../../services/apiClient.js';
import CaseThread from '../../components/CaseThread.jsx';
import MessageComposer from '../../components/MessageComposer.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Loader from '../../components/Loader.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import { CASE_STATUSES } from '../../utils/constants.js';
import { prettyStatus } from '../../utils/helpers.js';

export default function AdminCaseDetails() {
  const { caseId } = useParams();
  const { data: c, loading, error, reload, setData } = useFetch(() => adminApi.getCase(caseId), [caseId]);
  const [statusError, setStatusError] = useState('');
  const [updating, setUpdating] = useState(false);

  const changeStatus = async (e) => {
    const status = e.target.value;
    setUpdating(true);
    setStatusError('');
    try {
      const res = await adminApi.updateCaseStatus(caseId, status);
      setData((prev) => ({ ...prev, status: res.status, updatedAt: res.updatedAt }));
    } catch (err) {
      setStatusError(getErrorMessage(err));
    } finally {
      setUpdating(false);
    }
  };

  const reply = async (text) => {
    const msg = await adminApi.replyToCase(caseId, text);
    setData((prev) => ({ ...prev, messages: [...(prev.messages || []), msg] }));
  };

  if (loading && !c) return <Loader />;
  if (error) return <ErrorMessage message={error} onRetry={reload} />;

  // Optional fields — rendered only if the backend includes them
  const aiMessages = c.conversation?.messages;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link to="/admin/cases" className="text-sm text-indigo-600">← Back to cases</Link>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{c.subject}</h1>
            {c.user && <p className="text-sm text-slate-500">{c.user.name} · {c.user.email}</p>}
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={c.status} />
            <select className="input !w-auto" value={c.status} onChange={changeStatus} disabled={updating}>
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>{prettyStatus(s)}</option>
              ))}
            </select>
          </div>
        </div>
        <ErrorMessage message={statusError} />
        <p className="text-sm text-slate-600">{c.description}</p>
      </div>

      {aiMessages?.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer font-semibold">AI conversation ({aiMessages.length} messages)</summary>
          <div className="mt-3 space-y-2 text-sm">
            {aiMessages.map((m) => (
              <div key={m.id} className={`rounded-lg p-2 ${m.sender === 'USER' ? 'bg-indigo-50' : 'bg-slate-50'}`}>
                <span className="text-xs font-semibold text-slate-500">{m.sender}</span>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            ))}
          </div>
          {c.sources?.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-xs text-slate-600">
              {c.sources.map((s) => (
                <li key={s.id}>{s.title}</li>
              ))}
            </ul>
          )}
        </details>
      )}

      <div className="card space-y-4">
        <h2 className="font-semibold">Case messages</h2>
        <CaseThread messages={c.messages} viewerRole="AGENT" />
        <MessageComposer onSend={reply} placeholder="Reply to citizen..." />
      </div>
    </div>
  );
}