import { Link, useParams } from 'react-router-dom';
import useFetch from '../hooks/useFetch.js';
import * as serviceApi from '../services/serviceApi.js';
import DocumentChecklist from '../components/DocumentChecklist.jsx';
import Loader from '../components/Loader.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function Checklist() {
  const { serviceId } = useParams();
  const { data, loading, error, reload } = useFetch(() => serviceApi.getChecklist(serviceId), [serviceId]);

  if (loading) return <Loader />;
  if (error) return <ErrorMessage message={error} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to={`/services/${serviceId}`} className="text-sm text-indigo-600">← Back to service</Link>
      <h1 className="text-2xl font-bold">Document checklist</h1>
      <p className="text-slate-600">{data.serviceName}</p>
      <DocumentChecklist documents={data.documents} />
    </div>
  );
}