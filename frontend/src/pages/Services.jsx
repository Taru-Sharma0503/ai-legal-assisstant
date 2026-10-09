import { useState } from 'react';
import useFetch from '../hooks/useFetch.js';
import * as serviceApi from '../services/serviceApi.js';
import ServiceCard from '../components/ServiceCard.jsx';
import Pagination from '../components/Pagination.jsx';
import Loader from '../components/Loader.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

const LIMIT = 9;

export default function Services() {
  const [draft, setDraft] = useState({ q: '', department: '', region: '' });
  const [filters, setFilters] = useState({ q: '', department: '', region: '' });
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useFetch(() => {
    const params = { page, limit: LIMIT };
    Object.entries(filters).forEach(([k, v]) => v && (params[k] = v));
    return serviceApi.searchServices(params);
  }, [filters, page]);

  const submit = (e) => {
    e.preventDefault();
    setPage(1);
    setFilters(draft);
  };

  const change = (e) => setDraft({ ...draft, [e.target.name]: e.target.value });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Find a Service</h1>

      <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-4">
        <input className="input sm:col-span-2" name="q" placeholder="Search (e.g. income certificate)" value={draft.q} onChange={change} />
        <input className="input" name="department" placeholder="Department" value={draft.department} onChange={change} />
        <input className="input" name="region" placeholder="Region / State" value={draft.region} onChange={change} />
        <button className="btn-primary sm:col-span-4 sm:w-fit">Search</button>
      </form>

      <ErrorMessage message={error} onRetry={reload} />
      {loading ? (
        <Loader />
      ) : (
        <>
          {data?.services?.length === 0 && <p className="py-8 text-center text-slate-400">No services found.</p>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data?.services?.map((s) => <ServiceCard key={s.id} service={s} />)}
          </div>
          <Pagination pagination={data?.pagination} onChange={setPage} />
        </>
      )}
    </div>
  );
}