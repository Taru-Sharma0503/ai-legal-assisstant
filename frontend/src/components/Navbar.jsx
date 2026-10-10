import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { homeFor } from '../utils/helpers.js';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
      <Link to={homeFor(user?.role)} className="text-lg font-bold text-indigo-600">
        🏛️ Citizen Assistant
      </Link>
      <div className="flex items-center gap-3 text-sm">
        <span className="hidden text-slate-600 sm:inline">
          {user?.name} <span className="text-xs text-slate-400">({user?.role})</span>
        </span>
        <button onClick={handleLogout} className="btn-secondary">
          Logout
        </button>
      </div>
    </header>
  );
}