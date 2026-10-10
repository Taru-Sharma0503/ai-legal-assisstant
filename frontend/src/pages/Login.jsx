import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getErrorMessage } from '../services/apiClient.js';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { homeFor } from '../utils/helpers.js';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const u = await login(form);
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
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <ErrorMessage message={error} />
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" name="email" required value={form.email} onChange={change} />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" name="password" required value={form.password} onChange={change} />
        </div>
        <button className="btn-primary w-full" disabled={loading}>{loading ? 'Signing in...' : 'Login'}</button>
        <p className="text-center text-sm text-slate-600">
          New here? <Link to="/register" className="font-medium text-indigo-600">Create an account</Link>
        </p>
      </form>
    </div>
  );
}