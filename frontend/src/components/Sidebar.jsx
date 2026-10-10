import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const citizenLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/assistant', label: 'Ask AI' },
  { to: '/services', label: 'Find Service' },
  { to: '/offices', label: 'Offices' },
  { to: '/applications', label: 'Applications' },
  { to: '/cases', label: 'My Cases' },
];

const adminLinks = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/cases', label: 'Cases' },
  { to: '/admin/services', label: 'Services' },
];

export default function Sidebar() {
  const { user } = useAuth();
  const links = user?.role === 'CITIZEN' ? citizenLinks : adminLinks;

  return (
    <aside className="border-b border-slate-200 bg-white md:min-h-[calc(100vh-3.5rem)] md:w-56 md:border-b-0 md:border-r">
      <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}