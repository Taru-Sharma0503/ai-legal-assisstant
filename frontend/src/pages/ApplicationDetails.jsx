import { useRef, useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import useFetch from '../hooks/useFetch.js';
import * as applicationApi from '../services/applicationApi.js';
import * as serviceApi from '../services/serviceApi.js';
import { getErrorMessage } from '../services/apiClient.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Loader from '../components/Loader.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_MB } from '../utils/constants.js';
import { formatDate, prettyStatus } from '../utils/helpers.js';

const STEPS = ['DRAFT', 'SUBMITTED', 'UNDER_VERIFICATION', 'UNDER_REVIEW', 'APPROVED'];

function StatusTracker({ status }) {
  const rejected = status === 'REJECTED';
  const withdrawn = status === 'WITHDRAWN';
  const current = rejected || withdrawn ? 3 : STEPS.indexOf(status);

  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {STEPS.map((step, i) => {
        const done = i <= current && !(rejected && i === 4) && !(withdrawn && i === 4);
        const label = rejected && i === 4 ? 'REJECTED' : withdrawn && i === 4 ? 'WITHDRAWN' : step;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 font-medium ${
                rejected && i === 4
                  ? 'bg-red-100 text-red-700'
                  : withdrawn && i === 4
                  ? 'bg-zinc-200 text-zinc-700'
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
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  // Edit document name state
  const [editingDocId, setEditingDocId] = useState(null);
  const [editingDocName, setEditingDocName] = useState('');

  // Edit application (service change) state
  const [isEditingApp, setIsEditingApp] = useState(false);
  const [availableServices, setAvailableServices] = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [savingApp, setSavingApp] = useState(false);

  const fileInputRef = useRef(null);
  const pendingDoc = useRef(null);

  useEffect(() => {
    if (app?.service?.id) {
      setSelectedServiceId(app.service.id);
    }
  }, [app]);

  const loadServices = async () => {
    try {
      const res = await serviceApi.searchServices({ limit: 100 });
      setAvailableServices(res.services || []);
    } catch (e) {
      // ignore
    }
  };

  const handleStartEditApp = async () => {
    setIsEditingApp(true);
    setActionError('');
    setActionSuccess('');
    await loadServices();
  };

  const handleSaveApp = async () => {
    if (!selectedServiceId || selectedServiceId === app.service?.id) {
      setIsEditingApp(false);
      return;
    }
    setSavingApp(true);
    setActionError('');
    try {
      await applicationApi.updateApplication(applicationId, { serviceId: selectedServiceId });
      setActionSuccess('Application updated successfully');
      setIsEditingApp(false);
      await reload();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSavingApp(false);
    }
  };

  const pickFile = (doc) => {
    pendingDoc.current = doc;
    setActionError('');
    setActionSuccess('');
    fileInputRef.current.click();
  };

  const onFileChosen = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    const doc = pendingDoc.current;
    if (!file || !doc) return;

    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) return setActionError('Only PDF, JPG or PNG files are allowed');
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return setActionError(`File must be smaller than ${MAX_UPLOAD_MB} MB`);

    setUploadingId(doc.id);
    try {
      await applicationApi.uploadDocument(applicationId, doc.name, file);
      setActionSuccess(`Document "${doc.name}" uploaded successfully`);
      await reload();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setUploadingId(null);
    }
  };

  const handleDeleteDoc = async (doc) => {
    if (!window.confirm(`Are you sure you want to remove the uploaded document for "${doc.name}"?`)) return;
    setActionError('');
    setActionSuccess('');
    try {
      await applicationApi.deleteDocument(applicationId, doc.id);
      setActionSuccess(`Document "${doc.name}" removed successfully`);
      await reload();
    } catch (err) {
      setActionError(getErrorMessage(err));
    }
  };

  const handleSaveDocName = async (docId) => {
    if (!editingDocName.trim()) {
      setEditingDocId(null);
      return;
    }
    setActionError('');
    setActionSuccess('');
    try {
      await applicationApi.updateDocument(applicationId, docId, { name: editingDocName.trim() });
      setActionSuccess('Document name updated');
      setEditingDocId(null);
      await reload();
    } catch (err) {
      setActionError(getErrorMessage(err));
    }
  };

  const handleSubmitApplication = async () => {
    const pendingDocs = (app.documents || []).filter(d => d.status !== 'UPLOADED' && d.status !== 'VERIFIED');
    if (pendingDocs.length > 0) {
      setActionError(`Cannot submit. Please upload all required documents: ${pendingDocs.map(d => d.name).join(', ')}`);
      return;
    }

    if (!window.confirm('Are you ready to submit your application?')) return;
    setSubmitting(true);
    setActionError('');
    setActionSuccess('');
    try {
      await applicationApi.submitApplication(applicationId);
      setActionSuccess('Application submitted successfully!');
      await reload();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdrawApplication = async () => {
    if (!window.confirm('Are you sure you want to withdraw this application? This action cannot be undone.')) return;
    setWithdrawing(true);
    setActionError('');
    setActionSuccess('');
    try {
      await applicationApi.withdrawApplication(applicationId);
      setActionSuccess('Application withdrawn successfully');
      await reload();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading && !app) return <Loader />;
  if (error) return <ErrorMessage message={error} onRetry={reload} />;

  const isDraft = app.status === 'DRAFT';
  const isWithdrawn = app.status === 'WITHDRAWN';
  const isApproved = app.status === 'APPROVED';
  const allDocsUploaded = (app.documents || []).length > 0 &&
    (app.documents || []).every(d => d.status === 'UPLOADED' || d.status === 'VERIFIED');
  const canSubmit = isDraft && allDocsUploaded;
  const canWithdraw = !isWithdrawn && !isApproved;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/applications" className="text-sm text-indigo-600">← Back to applications</Link>
        <div className="flex items-center gap-2">
          {isDraft && !isEditingApp && (
            <button
              onClick={handleStartEditApp}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              ✏️ Edit Details
            </button>
          )}
          {canWithdraw && (
            <button
              onClick={handleWithdrawApplication}
              disabled={withdrawing}
              className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {withdrawing ? 'Withdrawing...' : 'Withdraw'}
            </button>
          )}
        </div>
      </div>

      <ErrorMessage message={actionError} />
      {actionSuccess && (
        <div className="rounded-lg bg-green-50 p-3 text-sm font-medium text-green-700">
          {actionSuccess}
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            {isEditingApp ? (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500">Change Service:</label>
                <div className="flex items-center gap-2">
                  <select
                    className="input !w-auto text-sm"
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                  >
                    {availableServices.length > 0 ? (
                      availableServices.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))
                    ) : (
                      <option value={app.service?.id}>{app.service?.name}</option>
                    )}
                  </select>
                  <button
                    onClick={handleSaveApp}
                    disabled={savingApp}
                    className="btn-primary !px-3 !py-1 text-xs"
                  >
                    {savingApp ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setIsEditingApp(false)}
                    className="btn-secondary !px-3 !py-1 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold">{app.service?.name}</h1>
                <p className="text-sm text-slate-500">Ref: {app.referenceNumber}</p>
              </>
            )}
          </div>
          <StatusBadge status={app.status} />
        </div>

        <StatusTracker status={app.status} />

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 border-t border-slate-100 pt-3">
          <div>
            Applied {formatDate(app.applicationDate)} · Updated {formatDate(app.updatedAt)}
          </div>
          {isDraft && (
            <div className="flex items-center gap-2">
              {!allDocsUploaded ? (
                <span className="text-amber-600 font-medium">
                  ⚠️ Upload all documents to enable submission
                </span>
              ) : (
                <button
                  onClick={handleSubmitApplication}
                  disabled={submitting || !canSubmit}
                  className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-green-700 disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : '🚀 Submit Application'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Required Documents</h2>
          <span className="text-xs text-slate-500">
            {app.documents?.filter(d => d.status === 'UPLOADED' || d.status === 'VERIFIED').length} of {app.documents?.length} uploaded
          </span>
        </div>

        <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={onFileChosen} />

        <ul className="space-y-2">
          {app.documents?.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex-1 min-w-[200px]">
                {editingDocId === d.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      className="input !py-1 text-xs"
                      value={editingDocName}
                      onChange={(e) => setEditingDocName(e.target.value)}
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveDocName(d.id)}
                      className="rounded bg-indigo-600 px-2 py-1 text-xs text-white"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingDocId(null)}
                      className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{d.name}</p>
                    {isDraft && (
                      <button
                        onClick={() => {
                          setEditingDocId(d.id);
                          setEditingDocName(d.name);
                        }}
                        title="Rename document"
                        className="text-xs text-slate-400 hover:text-indigo-600"
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                )}
                {d.fileUrl && (
                  <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 underline">
                    View uploaded file ↗
                  </a>
                )}
              </div>

              <div className="flex items-center gap-2">
                <StatusBadge status={d.status} />

                {/* Upload or Re-upload button */}
                {!isWithdrawn && !isApproved && (
                  <>
                    {(d.status === 'PENDING' || d.status === 'REJECTED') && (
                      <button
                        className="btn-secondary !px-3 !py-1 text-xs"
                        disabled={uploadingId === d.id}
                        onClick={() => pickFile(d)}
                      >
                        {uploadingId === d.id ? 'Uploading...' : d.status === 'REJECTED' ? 'Re-upload' : 'Upload'}
                      </button>
                    )}
                    {d.status === 'UPLOADED' && (
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          disabled={uploadingId === d.id}
                          onClick={() => pickFile(d)}
                        >
                          Replace
                        </button>
                        <button
                          onClick={() => handleDeleteDoc(d)}
                          className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          title="Delete uploaded file"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
