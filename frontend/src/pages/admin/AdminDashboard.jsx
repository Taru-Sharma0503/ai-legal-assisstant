import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch.js';
import * as adminApi from '../../services/adminApi.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import Loader from '../../components/Loader.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import { formatDate, toList } from '../../utils/helpers.js';

export default function AdminDashboard() {
  const { data, loading, error, reload } = useFetch(() => adminApi.getCases({ page: 1, limit: 100 }), []);

  if (loading) return <Loader />;
  if (error) return <ErrorMessage message={error} onRetry={reload} />;

  const cases = toList(data, 'cases', 'escalations');
  const count = (s) => cases.filter((c) => c.status === s).length;
  const pending = cases.filter((c) => c.status === 'PENDING').slice(0, 5);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Support Overview</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Pending', count('PENDING')],
          ['In review', count('IN_REVIEW')],
          ['Responded', count('RESPONDED')],
          ['Resolved', count('RESOLVED')],
        ].map(([label, n]) => (
          <div key={label} className="card">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-3xl font-bold text-indigo-600">{n}</p>
          </div>
        ))}
      </div>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Oldest pending cases</h2>
          <Link to="/admin/cases" className="text-sm text-indigo-600">View all →</Link>
        </div>
        {pending.length === 0 && <p className="text-sm text-slate-400">No pending cases 🎉</p>}
        <ul className="space-y-2">
          {pending.map((c) => (
            <li key={c.id}>
              <Link to={`/admin/cases/${c.id}`} className="flex items-center justify-between rounded-lg p-2 hover:bg-slate-50">
                <div>
                  <p className="text-sm font-medium">{c.subject}</p>
                  <p className="text-xs text-slate-400">{formatDate(c.createdAt)}</p>
                </div>
                <StatusBadge status={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}