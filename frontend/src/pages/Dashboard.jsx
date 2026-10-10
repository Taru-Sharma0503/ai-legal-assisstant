import { Link } from 'react-router-dom';
import useFetch from '../hooks/useFetch.js';
import * as dashboardApi from '../services/dashboardApi.js';
import Loader from '../components/Loader.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

export default function Dashboard() {
  const { data, loading, error, reload } = useFetch(() => dashboardApi.getDashboard(), []);

  if (loading) return <Loader />;
  if (error) return <ErrorMessage message={error} onRetry={reload} />;

  const { user, counts, recentApplications = [], recentCases = [] } = data;

  const stats = [
    ['Applications', counts.applications],
    ['Pending', counts.pendingApplications],
    ['Cases', counts.cases],
    ['Open cases', counts.openCases],
  ];

  const actions = [
    ['/assistant', '🤖 Ask AI'],
    ['/services', '🔎 Find Service'],
    ['/applications', '📄 Applications'],
    ['/cases', '💬 My Cases'],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Hello, {user?.name} 👋</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="card">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-3xl font-bold text-indigo-600">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {actions.map(([to, label]) => (
          <Link key={to} to={to} className="card text-center font-medium hover:border-indigo-300 hover:shadow">
            {label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Recent applications</h2>
          {recentApplications.length === 0 && <p className="text-sm text-slate-400">No applications yet.</p>}
          <ul className="space-y-2">
            {recentApplications.map((a) => (
              <li key={a.id}>
                <Link to={`/applications/${a.id}`} className="flex items-center justify-between rounded-lg p-2 hover:bg-slate-50">
                  <span className="text-sm">{a.serviceName}</span>
                  <StatusBadge status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Recent cases</h2>
          {recentCases.length === 0 && <p className="text-sm text-slate-400">No cases yet.</p>}
          <ul className="space-y-2">
            {recentCases.map((c) => (
              <li key={c.id}>
                <Link to={`/cases/${c.id}`} className="flex items-center justify-between rounded-lg p-2 hover:bg-slate-50">
                  <span className="text-sm">{c.subject}</span>
                  <StatusBadge status={c.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}