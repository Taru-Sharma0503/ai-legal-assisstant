import { useState } from 'react';
import useFetch from '../../hooks/useFetch.js';
import * as serviceApi from '../../services/serviceApi.js';
import * as adminApi from '../../services/adminApi.js';
import { getErrorMessage } from '../../services/apiClient.js';
import Pagination from '../../components/Pagination.jsx';
import Loader from '../../components/Loader.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import { APPLICATION_METHODS } from '../../utils/constants.js';

const EMPTY = {
  name: '',
  department: '',
  description: '',
  eligibility: '',
  applicationMethod: 'BOTH',
  governmentPortalUrl: '',
  region: '',
  documents: [{ name: '', description: '', mandatory: true }],
};

function ServiceForm({ initial, onCancel, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editing = !!form.id;

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const setDoc = (i, patch) =>
    setForm({ ...form, documents: form.documents.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) });
  const addDoc = () => setForm({ ...form, documents: [...form.documents, { name: '', description: '', mandatory: true }] });
  const removeDoc = (i) => setForm({ ...form, documents: form.documents.filter((_, idx) => idx !== i) });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      name: form.name,
      department: form.department,
      description: form.description,
      eligibility: form.eligibility,
      applicationMethod: form.applicationMethod,
      governmentPortalUrl: form.governmentPortalUrl || null,
      region: form.region || null,
      documents: form.documents
        .filter((d) => d.name.trim())
        .map((d) => ({ name: d.name.trim(), description: d.description || null, mandatory: !!d.mandatory })),
    };
    try {
      if (editing) await adminApi.updateService(form.id, payload);
      else await adminApi.createService(payload);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <form onSubmit={submit} className="my-8 w-full max-w-2xl space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">{editing ? 'Edit service' : 'New service'}</h2>
        <ErrorMessage message={error} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Name</label>
            <input className="input" name="name" required maxLength={200} value={form.name} onChange={change} />
          </div>
          <div>
            <label className="label">Department</label>
            <input className="input" name="department" required maxLength={200} value={form.department} onChange={change} />
          </div>
          <div>
            <label className="label">Application method</label>
            <select className="input" name="applicationMethod" value={form.applicationMethod} onChange={change}>
              {APPLICATION_METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Region</label>
            <input className="input" name="region" value={form.region} onChange={change} />
          </div>
        </div>

        <div>
          <label className="label">Government portal URL</label>
          <input className="input" type="url" name="governmentPortalUrl" value={form.governmentPortalUrl} onChange={change} placeholder="https://..." />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" rows={3} name="description" required value={form.description} onChange={change} />
        </div>
        <div>
          <label className="label">Eligibility</label>
          <textarea className="input" rows={3} name="eligibility" required value={form.eligibility} onChange={change} />
        </div>

        <div>
          <label className="label">Required documents</label>
          <div className="space-y-2">
            {form.documents.map((d, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input className="input !w-48 flex-1" placeholder="Document name" value={d.name} onChange={(e) => setDoc(i, { name: e.target.value })} />
                <input className="input !w-48 flex-1" placeholder="Description (optional)" value={d.description || ''} onChange={(e) => setDoc(i, { description: e.target.value })} />
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={!!d.mandatory} onChange={(e) => setDoc(i, { mandatory: e.target.checked })} /> Mandatory
                </label>
                <button type="button" className="text-sm text-red-600" onClick={() => removeDoc(i)}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" className="mt-2 text-sm text-indigo-600" onClick={addDoc}>+ Add document</button>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}

export default function AdminServices() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // service form initial values or null
  const [actionError, setActionError] = useState('');

  const { data, loading, error, reload } = useFetch(() => {
    const params = { page, limit: 10 };
    if (query) params.q = query;
    return serviceApi.searchServices(params);
  }, [query, page]);

  const openEdit = async (id) => {
    setActionError('');
    try {
      const s = await serviceApi.getService(id);
      setEditing({
        id: s.id,
        name: s.name || '',
        department: s.department || '',
        description: s.description || '',
        eligibility: s.eligibility || '',
        applicationMethod: s.applicationMethod || 'BOTH',
        governmentPortalUrl: s.governmentPortalUrl || '',
        region: s.region || '',
        documents: s.documents?.length
          ? s.documents.map((d) => ({ name: d.name, description: d.description || '', mandatory: !!d.mandatory }))
          : [{ name: '', description: '', mandatory: true }],
      });
    } catch (e) {
      setActionError(getErrorMessage(e));
    }
  };

  const deactivate = async (s) => {
    if (!window.confirm(`Deactivate "${s.name}"? It will no longer be visible to citizens.`)) return;
    setActionError('');
    try {
      await adminApi.deactivateService(s.id);
      reload();
    } catch (e) {
      setActionError(getErrorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Manage Services</h1>
        <button className="btn-primary" onClick={() => setEditing(EMPTY)}>+ New service</button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q); }} className="flex gap-2">
        <input className="input" placeholder="Search services..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-secondary">Search</button>
      </form>

      <ErrorMessage message={error || actionError} onRetry={error ? reload : undefined} />

      {loading ? (
        <Loader />
      ) : (
        <>
          <div className="space-y-3">
            {data?.services?.map((s) => (
              <div key={s.id} className="card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{s.name}</h3>
                  <p className="text-xs text-slate-500">{s.department} · {s.region || 'All regions'} · {s.applicationMethod}</p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary !px-3 !py-1" onClick={() => openEdit(s.id)}>Edit</button>
                  <button className="btn-danger !px-3 !py-1" onClick={() => deactivate(s)}>Deactivate</button>
                </div>
              </div>
            ))}
            {data?.services?.length === 0 && <p className="py-8 text-center text-slate-400">No services found.</p>}
          </div>
          <Pagination pagination={data?.pagination} onChange={setPage} />
        </>
      )}

      {editing && (
        <ServiceForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}