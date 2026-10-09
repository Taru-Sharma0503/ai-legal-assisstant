import { Link, useParams } from 'react-router-dom';
import useFetch from '../hooks/useFetch.js';
import * as escalationApi from '../services/escalationApi.js';
import CaseThread from '../components/CaseThread.jsx';
import MessageComposer from '../components/MessageComposer.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Loader from '../components/Loader.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function CaseDetails() {
  const { caseId } = useParams();
  const { data: c, loading, error, reload, setData } = useFetch(() => escalationApi.getEscalation(caseId), [caseId]);

  const send = async (text) => {
    const msg = await escalationApi.sendCaseMessage(caseId, text);
    // append immediately, no refetch
    setData((prev) => ({ ...prev, messages: [...(prev.messages || []), msg] }));
  };

  if (loading && !c) return <Loader />;
  if (error) return <ErrorMessage message={error} onRetry={reload} />;

  const closed = c.status === 'CLOSED';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/cases" className="text-sm text-indigo-600">← Back to cases</Link>

      <div className="card space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-xl font-bold">{c.subject}</h1>
          <StatusBadge status={c.status} />
        </div>
        <p className="text-sm text-slate-600">{c.description}</p>
      </div>

      <div className="card space-y-4">
        <CaseThread messages={c.messages} viewerRole="CITIZEN" />
        {closed ? (
          <p className="text-center text-sm text-slate-400">This case is closed.</p>
        ) : (
          <MessageComposer onSend={send} />
        )}
      </div>
    </div>
  );
}