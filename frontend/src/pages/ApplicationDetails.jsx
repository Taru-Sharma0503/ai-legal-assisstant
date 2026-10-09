import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import useFetch from '../hooks/useFetch.js';
import * as applicationApi from '../services/applicationApi.js';
import { getErrorMessage } from '../services/apiClient.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Loader from '../components/Loader.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_MB } from '../utils/constants.js';
import { formatDate, prettyStatus } from '../utils/helpers.js';

const STEPS = ['DRAFT', 'SUBMITTED', 'UNDER_VERIFICATION', 'UNDER_REVIEW', 'APPROVED'];

function StatusTracker({ status }) {
  const rejected = status === 'REJECTED';
  const current = rejected ? 3 : STEPS.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {STEPS.map((step, i) => {
        const done = i <= current && !(rejected && i === 4);
        const label = rejected && i === 4 ? 'REJECTED' : step;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 font-medium ${
                rejected && i === 4
                  ? 'bg-red-100 text-red-700'
                  : done
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {prettyStatus(label)}
            </span>
            {i < STEPS.length - 1 && <span className="text-slate-300">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

export default function ApplicationDetails() {
  const { applicationId } = useParams();
  const { data: app, loading, error, reload } = useFetch(() => applicationApi.getApplication(applicationId), [applicationId]);

  const [uploadingId, setUploadingId] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);
  const pendingDoc = useRef(null);

  const pickFile = (doc) => {
    pendingDoc.current = doc;
    setUploadError('');
    fileInputRef.current.click();
  };

  const onFileChosen = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    const doc = pendingDoc.current;
    if (!file || !doc) return;

    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) return setUploadError('Only PDF, JPG or PNG files are allowed');
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return setUploadError(`File must be smaller than ${MAX_UPLOAD_MB} MB`);

    setUploadingId(doc.id);
    try {
      await applicationApi.uploadDocument(applicationId, doc.name, file);
      await reload();
    } catch (err) {
      setUploadError(getErrorMessage(err));
    } finally {
      setUploadingId(null);
    }
  };

  if (loading && !app) return <Loader />;
  if (error) return <ErrorMessage message={error} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/applications" className="text-sm text-indigo-600">← Back to applications</Link>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">{app.service?.name}</h1>
            <p className="text-sm text-slate-500">Ref: {app.referenceNumber}</p>
          </div>
          <StatusBadge status={app.status} />
        </div>

        <StatusTracker status={app.status} />

        <div className="text-xs text-slate-500">
          Applied {formatDate(app.applicationDate)} · Updated {formatDate(app.updatedAt)}
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Documents</h2>
        <ErrorMessage message={uploadError} />
        <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={onFileChosen} />

        <ul className="space-y-2">
          {app.documents?.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm">
              <div>
                <p className="font-medium">{d.name}</p>
                {d.fileUrl && (
                  <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 underline">
                    View file ↗
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={d.status} />
                {(d.status === 'PENDING' || d.status === 'REJECTED') && (
                  <button className="btn-secondary !px-3 !py-1" disabled={uploadingId === d.id} onClick={() => pickFile(d)}>
                    {uploadingId === d.id ? 'Uploading...' : d.status === 'REJECTED' ? 'Re-upload' : 'Upload'}
                  </button>
                )}
                {d.status === 'UPLOADED' && <span className="text-xs text-green-600">✓ Uploaded</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}