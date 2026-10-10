import { useState } from 'react';
import useFetch from '../hooks/useFetch.js';
import * as applicationApi from '../services/applicationApi.js';
import ApplicationCard from '../components/ApplicationCard.jsx';
import Pagination from '../components/Pagination.jsx';
import Loader from '../components/Loader.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { APPLICATION_STATUSES } from '../utils/constants.js';
import { prettyStatus } from '../utils/helpers.js';

export default function Applications() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useFetch(() => {
    const params = { page, limit: 10 };
    if (status) params.status = status;
    return applicationApi.getApplications(params);
  }, [status, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">My Applications</h1>
        <select className="input !w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>{prettyStatus(s)}</option>
          ))}
        </select>
      </div>

      <ErrorMessage message={error} onRetry={reload} />
      {loading ? (
        <Loader />
      ) : (
        <>
          {data?.applications?.length === 0 && <p className="py-8 text-center text-slate-400">No applications found.</p>}
          <div className="space-y-3">
            {data?.applications?.map((a) => <ApplicationCard key={a.id} application={a} />)}
          </div>
          <Pagination pagination={data?.pagination} onChange={setPage} />
        </>
      )}
    </div>
  );
}