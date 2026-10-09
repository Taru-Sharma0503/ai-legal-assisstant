import { useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch.js';
import * as adminApi from '../../services/adminApi.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import Pagination from '../../components/Pagination.jsx';
import Loader from '../../components/Loader.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import { CASE_STATUSES } from '../../utils/constants.js';
import { formatDate, prettyStatus, toList } from '../../utils/helpers.js';

export default function AdminCases() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useFetch(() => {
    const params = { page, limit: 10 };
    if (status) params.status = status;
    return adminApi.getCases(params);
  }, [status, page]);

  const cases = toList(data, 'cases', 'escalations');
  const pagination = Array.isArray(data) ? null : data?.pagination;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Escalated Cases</h1>

      <div className="flex flex-wrap gap-2">
        {['', ...CASE_STATUSES].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => { setStatus(s); setPage(1); }}
            className={`rounded-full px-3 py-1 text-sm ${status === s ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >
            {s ? prettyStatus(s) : 'All'}
          </button>
        ))}
      </div>

      <ErrorMessage message={error} onRetry={reload} />
      {loading ? (
        <Loader />
      ) : (
        <>
          {cases.length === 0 && <p className="py-8 text-center text-slate-400">No cases found.</p>}
          <div className="space-y-3">
            {cases.map((c) => (
              <Link key={c.id} to={`/admin/cases/${c.id}`} className="card flex items-center justify-between gap-3 hover:border-indigo-300">
                <div>
                  <h3 className="font-semibold">{c.subject}</h3>
                  <p className="text-xs text-slate-400">
                    {c.user?.name && <>{c.user.name} · </>}
                    Created {formatDate(c.createdAt)}
                  </p>
                </div>
                <StatusBadge status={c.status} />
              </Link>
            ))}
          </div>
          <Pagination pagination={pagination} onChange={setPage} />
        </>
      )}
    </div>
  );
}