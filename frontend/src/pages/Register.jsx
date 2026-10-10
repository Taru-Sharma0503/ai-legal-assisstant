import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getErrorMessage } from '../services/apiClient.js';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { LANGUAGES } from '../utils/constants.js';
import { homeFor } from '../utils/helpers.js';

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', preferredLanguage: 'en' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    setLoading(true);
    setError('');
    try {
      const u = await register(form);
      navigate(homeFor(u.role), { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 !p-6">
        <h1 className="text-2xl font-bold">Create account</h1>
        <ErrorMessage message={error} />
        <div>
          <label className="label">Full name</label>
          <input className="input" name="name" required maxLength={100} value={form.name} onChange={change} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" name="email" required value={form.email} onChange={change} />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" name="password" required minLength={8} value={form.password} onChange={change} />
        </div>
        <div>
          <label className="label">Preferred language</label>
          <select className="input" name="preferredLanguage" value={form.preferredLanguage} onChange={change}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary w-full" disabled={loading}>{loading ? 'Creating...' : 'Register'}</button>
        <p className="text-center text-sm text-slate-600">
          Already registered? <Link to="/login" className="font-medium text-indigo-600">Login</Link>
        </p>
      </form>
    </div>
  );
}