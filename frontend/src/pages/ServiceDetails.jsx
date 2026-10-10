
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useFetch from '../hooks/useFetch.js';
import * as serviceApi from '../services/serviceApi.js';
import { getErrorMessage } from '../services/apiClient.js';
import Loader from '../components/Loader.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function ServiceDetails() {
  const { serviceId } = useParams();
  const navigate = useNavigate();

  const { data: s, loading, error, reload } = useFetch(
    () => serviceApi.getService(serviceId),
    [serviceId]
  );

  const [showForm, setShowForm] = useState(false);
  const [startError, setStartError] = useState('');

  const [details, setDetails] = useState({
    fullName: '',
    dateOfBirth: '',
    gender: '',
    mobile: '',
    email: '',
    address: '',
    annualIncome: '',
    occupation: '',
    incomeSource: '',
  });

  const updateField = (e) => {
    setDetails({ ...details, [e.target.name]: e.target.value });
  };

  const handleContinue = (e) => {
    e.preventDefault();
    setStartError('');

    // The next step will connect these details to application creation.
    // For now, validate the form and confirm that the flow works.
    if (s?.name?.toLowerCase().includes('income certificate')) {
      if (!details.annualIncome || !details.occupation || !details.incomeSource) {
        setStartError('Please complete all income-related fields.');
        return;
      }
    }

    navigate(`/services/${serviceId}/checklist`, {
      state: { applicantDetails: details },
    });
  };

  if (loading) return <Loader />;
  if (error) return <ErrorMessage message={error} onRetry={reload} />;

  const isIncomeCertificate = s?.name?.toLowerCase().includes('income certificate');

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/services" className="text-sm text-indigo-600">
        ← Back to services
      </Link>

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
          <span className="rounded bg-slate-100 px-2 py-1">
            Method: {s.applicationMethod}
          </span>
          {s.region && (
            <span className="rounded bg-slate-100 px-2 py-1">
              Region: {s.region}
            </span>
          )}
          {s.governmentPortalUrl && (
            <a
              href={s.governmentPortalUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded bg-indigo-50 px-2 py-1 text-indigo-700 underline"
            >
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
                {d.mandatory && (
                  <span className="ml-2 text-xs text-red-600">Mandatory</span>
                )}
                {d.description && (
                  <p className="text-xs text-slate-500">{d.description}</p>
                )}
              </li>
            ))}
          </ul>
        </div>

        {showForm ? (
          <form onSubmit={handleContinue} className="space-y-4 border-t pt-4">
            <div>
              <h2 className="text-xl font-bold">Applicant Details</h2>
              <p className="text-sm text-slate-500">
                Enter the applicant's information before proceeding.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Full name *
                <input
                  className="input mt-1"
                  name="fullName"
                  value={details.fullName}
                  onChange={updateField}
                  required
                />
              </label>

              <label className="text-sm font-medium">
                Date of birth *
                <input
                  className="input mt-1"
                  type="date"
                  name="dateOfBirth"
                  value={details.dateOfBirth}
                  onChange={updateField}
                  required
                />
              </label>

              <label className="text-sm font-medium">
                Gender *
                <select
                  className="input mt-1"
                  name="gender"
                  value={details.gender}
                  onChange={updateField}
                  required
                >
                  <option value="">Select gender</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </label>

              <label className="text-sm font-medium">
                Mobile number *
                <input
                  className="input mt-1"
                  type="tel"
                  name="mobile"
                  value={details.mobile}
                  onChange={updateField}
                  pattern="[0-9]{10}"
                  title="Enter a 10-digit mobile number"
                  required
                />
              </label>

              <label className="text-sm font-medium sm:col-span-2">
                Email address
                <input
                  className="input mt-1"
                  type="email"
                  name="email"
                  value={details.email}
                  onChange={updateField}
                />
              </label>

              <label className="text-sm font-medium sm:col-span-2">
                Full residential address *
                <textarea
                  className="input mt-1"
                  name="address"
                  value={details.address}
                  onChange={updateField}
                  rows={3}
                  required
                />
              </label>

              {isIncomeCertificate && (
                <>
                  <label className="text-sm font-medium">
                    Annual family income (₹) *
                    <input
                      className="input mt-1"
                      type="number"
                      name="annualIncome"
                      min="0"
                      value={details.annualIncome}
                      onChange={updateField}
                      required
                    />
                  </label>

                  <label className="text-sm font-medium">
                    Occupation *
                    <input
                      className="input mt-1"
                      name="occupation"
                      value={details.occupation}
                      onChange={updateField}
                      required
                    />
                  </label>

                  <label className="text-sm font-medium sm:col-span-2">
                    Source of income *
                    <input
                      className="input mt-1"
                      name="incomeSource"
                      placeholder="e.g. Salary, business, agriculture"
                      value={details.incomeSource}
                      onChange={updateField}
                      required
                    />
                  </label>
                </>
              )}
            </div>

            <ErrorMessage message={startError} />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowForm(false)}
              >
                Back
              </button>
              <button type="submit" className="btn-primary">
                Continue
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Link to={`/services/${s.id}/checklist`} className="btn-secondary">
              View Checklist
            </Link>
            <Link to={`/offices?serviceId=${s.id}`} className="btn-secondary">
              Find Offices
            </Link>
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary"
            >
              Start Application
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
