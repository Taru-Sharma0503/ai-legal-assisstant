
import { useLocation, useNavigate, Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import useFetch from '../hooks/useFetch.js';
import * as serviceApi from '../services/serviceApi.js';
import * as applicationApi from '../services/applicationApi.js';
import { getErrorMessage } from '../services/apiClient.js';
import DocumentChecklist from '../components/DocumentChecklist.jsx';
import Loader from '../components/Loader.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function Checklist() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { data, loading, error, reload } = useFetch(
    () => serviceApi.getChecklist(serviceId),
    [serviceId]
  );

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  const applicantDetails = location.state?.applicantDetails || {};

  const handleContinue = async () => {
    setStarting(true);
    setStartError('');

    try {
      const app = await applicationApi.createApplication(
        serviceId,
        applicantDetails
      );

      navigate(`/applications/${app.id}`, {
        state: { applicantDetails }
      });
    } catch (err) {
      setStartError(getErrorMessage(err));
      setStarting(false);
    }
  };

  if (loading) return <Loader />;
  if (error) return <ErrorMessage message={error} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        to={`/services/${serviceId}`}
        className="text-sm text-indigo-600"
      >
        ← Back to service
      </Link>

      <h1 className="text-2xl font-bold">Document checklist</h1>
      <p className="text-slate-600">{data.serviceName}</p>

      <DocumentChecklist documents={data.documents} />

      <div className="card space-y-3">
        <h2 className="font-semibold">Ready to continue?</h2>

        <p className="text-sm text-slate-600">
          Review the required documents, then continue to your application
          to upload them.
        </p>

        <ErrorMessage message={startError} />

        <button
          type="button"
          onClick={handleContinue}
          disabled={starting}
          className="btn-primary w-full"
        >
          {starting ? 'Creating application...' : 'Continue to Application'}
        </button>
      </div>
    </div>
  );
}
