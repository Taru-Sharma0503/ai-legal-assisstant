
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

const STEPS = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_VERIFICATION',
  'UNDER_REVIEW',
  'APPROVED',
];

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

            {i < STEPS.length - 1 && (
              <span className="text-slate-300">→</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function DetailItem({ label, value }) {
  const displayValue =
    value !== null && value !== undefined && String(value).trim() !== ''
      ? value
      : 'Not provided';

  return (
    <div className="min-w-0 rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-medium text-slate-800">
        {displayValue}
      </p>
    </div>
  );
}

export default function ApplicationDetails() {
  const { applicationId } = useParams();

  const {
    data: app,
    loading,
    error,
    reload,
  } = useFetch(
    () => applicationApi.getApplication(applicationId),
    [applicationId]
  );

  const [uploadingId, setUploadingId] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const fileInputRef = useRef(null);
  const pendingDoc = useRef(null);

  const allDocumentsUploaded =
    Boolean(app?.documents?.length) &&
    app.documents.every((doc) => doc.status === 'UPLOADED');

  const pickFile = (doc) => {
    pendingDoc.current = doc;
    setUploadError('');

    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const onFileChosen = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';

    const doc = pendingDoc.current;
    if (!file || !doc) return;

    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      setUploadError('Only PDF, JPG or PNG files are allowed.');
      return;
    }

    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setUploadError(`File must be smaller than ${MAX_UPLOAD_MB} MB.`);
      return;
    }

    setUploadingId(doc.id);
    setUploadError('');

    try {
      await applicationApi.uploadDocument(applicationId, doc.name, file);
      await reload();
    } catch (err) {
      setUploadError(getErrorMessage(err));
    } finally {
      setUploadingId(null);
    }
  };

  const handleSubmitApplication = async () => {
    if (!allDocumentsUploaded) {
      setSubmitError('Please upload all listed documents before submitting.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      await applicationApi.submitApplication(applicationId);
      await reload();
    } catch (err) {
      setSubmitError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !app) return <Loader />;

  if (error) {
    return <ErrorMessage message={error} onRetry={reload} />;
  }

  if (!app) return <Loader />;

  const details = app.applicantDetails || {};

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/applications" className="text-sm text-indigo-600">
        ← Back to applications
      </Link>

      {/* Application summary */}
      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">
              {app.service?.name || 'Government Service'}
            </h1>
            <p className="text-sm text-slate-500">
              Ref: {app.referenceNumber}
            </p>
          </div>

          <StatusBadge status={app.status} />
        </div>

        <StatusTracker status={app.status} />

        <div className="text-xs text-slate-500">
          Applied {formatDate(app.applicationDate)} · Updated{' '}
          {formatDate(app.updatedAt)}
        </div>
      </div>

      {/* Applicant details */}
      <div className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Applicant Details</h2>
          <p className="mt-1 text-sm text-slate-500">
            Personal and contact information provided with this application.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DetailItem
            label="Full Name"
            value={details.fullName}
          />

          <DetailItem
            label="Date of Birth"
            value={
              details.dateOfBirth
                ? formatDate(details.dateOfBirth)
                : ''
            }
          />

          <DetailItem
            label="Gender"
            value={details.gender}
          />

          <DetailItem
            label="Mobile Number"
            value={details.mobile}
          />

          <DetailItem
            label="Email Address"
            value={details.email}
          />

          <DetailItem
            label="Annual Income"
            value={
              details.annualIncome !== null &&
              details.annualIncome !== undefined &&
              details.annualIncome !== ''
                ? `₹${Number(details.annualIncome).toLocaleString('en-IN')}`
                : ''
            }
          />

          <DetailItem
            label="Occupation"
            value={details.occupation}
          />

          <DetailItem
            label="Income Source"
            value={details.incomeSource}
          />

          <div className="sm:col-span-2">
            <DetailItem
              label="Residential Address"
              value={details.address}
            />
          </div>
        </div>
      </div>

      {/* Documents */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Documents</h2>

        <ErrorMessage message={uploadError} />

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={onFileChosen}
        />

        <ul className="space-y-2">
          {app.documents?.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"
            >
              <div>
                <p className="font-medium">{d.name}</p>

                {d.fileUrl && (
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-600 underline"
                  >
                    View file ↗
                  </a>
                )}
              </div>

              <div className="flex items-center gap-2">
                <StatusBadge status={d.status} />

                {(d.status === 'PENDING' || d.status === 'REJECTED') &&
                  app.status === 'DRAFT' && (
                    <button
                      type="button"
                      className="btn-secondary !px-3 !py-1"
                      disabled={uploadingId === d.id || submitting}
                      onClick={() => pickFile(d)}
                    >
                      {uploadingId === d.id
                        ? 'Uploading...'
                        : d.status === 'REJECTED'
                          ? 'Re-upload'
                          : 'Upload'}
                    </button>
                  )}

                {d.status === 'UPLOADED' && (
                  <span className="text-xs text-green-600">
                    ✓ Uploaded
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Submit application */}
      {app.status === 'DRAFT' && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Submit your application</h2>

          <p className="text-sm text-slate-600">
            Ensure all required documents have been uploaded before
            submitting. Your application will then be marked as submitted
            for processing.
          </p>

          {!allDocumentsUploaded && (
            <p className="text-sm text-amber-700">
              Upload all listed documents to enable submission.
            </p>
          )}

          <ErrorMessage message={submitError} />

          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmitApplication}
            disabled={
              !allDocumentsUploaded ||
              submitting ||
              uploadingId !== null
            }
          >
            {submitting ? 'Submitting...' : 'Submit Application'}
          </button>
        </div>
      )}

      {app.status === 'SUBMITTED' && (
        <div className="card">
          <p className="font-medium text-green-700">
            Your application has been submitted successfully.
          </p>
          <p className="mt-1 text-sm text-slate-600">
            You can track its status from this page.
          </p>
        </div>
      )}
    </div>
  );
}
