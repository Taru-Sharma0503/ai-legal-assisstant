import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useFetch from '../hooks/useFetch.js';
import * as serviceApi from '../services/serviceApi.js';
import * as applicationApi from '../services/applicationApi.js';
import { getErrorMessage } from '../services/apiClient.js';
import Loader from '../components/Loader.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function ServiceDetails() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const { data: s, loading, error, reload } = useFetch(() => serviceApi.getService(serviceId), [serviceId]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  const startApplication = async () => {
    setStarting(true);
    setStartError('');
    try {
      const app = await applicationApi.createApplication(serviceId);
      navigate(`/applications/${app.id}`);
    } catch (e) {
      setStartError(getErrorMessage(e));
      setStarting(false);
    }
  };

  if (loading) return <Loader />;
  if (error) return <ErrorMessage message={error} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/services" className="text-sm text-indigo-600">← Back to services</Link>

      <div className="card space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{s.name}</h1>
          <p className="text-sm text-indigo-600">{s.department}</p>
        </div>

        <div>
          <h2 className="font-semibold">Description</h2>
          <p className="text-sm text-slate-600">{s.description}</p>
        </div>

        <div>
          <h2 className="font-semibold">Eligibility</h2>
          <p className="text-sm text-slate-600">{s.eligibility}</p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-slate-100 px-2 py-1">Method: {s.applicationMethod}</span>
          {s.region && <span className="rounded bg-slate-100 px-2 py-1">Region: {s.region}</span>}
          {s.governmentPortalUrl && (
            <a href={s.governmentPortalUrl} target="_blank" rel="noreferrer" className="rounded bg-indigo-50 px-2 py-1 text-indigo-700 underline">
              Government portal ↗
            </a>
          )}
        </div>

        <div>
          <h2 className="mb-2 font-semibold">Required documents</h2>
          <ul className="space-y-2">
            {s.documents?.map((d) => (
              <li key={d.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <span className="font-medium">{d.name}</span>
                {d.mandatory && <span className="ml-2 text-xs text-red-600">Mandatory</span>}
                {d.description && <p className="text-xs text-slate-500">{d.description}</p>}
              </li>
            ))}
          </ul>
        </div>

        <ErrorMessage message={startError} />
        <div className="flex flex-wrap gap-2">
          <Link to={`/services/${s.id}/checklist`} className="btn-secondary">View Checklist</Link>
          <Link to={`/offices?serviceId=${s.id}`} className="btn-secondary">Find Offices</Link>
          <button onClick={startApplication} disabled={starting} className="btn-primary">
            {starting ? 'Starting...' : 'Start Application'}
          </button>
        </div>
      </div>
    </div>
  );
}