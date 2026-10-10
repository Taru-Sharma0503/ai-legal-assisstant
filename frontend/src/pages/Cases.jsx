import { Link } from 'react-router-dom';
import useFetch from '../hooks/useFetch.js';
import * as escalationApi from '../services/escalationApi.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Loader from '../components/Loader.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { formatDate, toList } from '../utils/helpers.js';

export default function Cases() {
  const { data, loading, error, reload } = useFetch(() => escalationApi.getEscalations(), []);
  const cases = toList(data, 'cases', 'escalations');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Cases</h1>
        <Link to="/assistant" className="btn-secondary">Ask AI</Link>
      </div>
      <ErrorMessage message={error} onRetry={reload} />
      {loading ? (
        <Loader />
      ) : (
        <div className="space-y-3">
          {cases.length === 0 && <p className="py-8 text-center text-slate-400">You have no cases yet.</p>}
          {cases.map((c) => (
            <Link key={c.id} to={`/cases/${c.id}`} className="card flex items-center justify-between gap-3 hover:border-indigo-300">
              <div>
                <h3 className="font-semibold">{c.subject}</h3>
                <p className="text-xs text-slate-400">Updated {formatDate(c.updatedAt)}</p>
              </div>
              <StatusBadge status={c.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}