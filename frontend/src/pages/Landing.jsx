import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { homeFor } from '../utils/helpers.js';

const features = [
  ['🤖', 'Ask the AI', 'Get answers on legal rights and government services in English or Hindi, grounded in verified sources.'],
  ['📋', 'Document checklists', 'Know exactly which documents you need before you visit an office.'],
  ['📍', 'Find offices', 'Locate the nearest service centre with hours and contact details.'],
  ['🧑‍💼', 'Human support', 'Not sure about the AI answer? Escalate to a human representative.'],
];

export default function Landing() {
  const { user } = useAuth();
  if (user) return <Navigate to={homeFor(user.role)} replace />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between p-4">
        <span className="text-lg font-bold text-indigo-600">🏛️ Citizen Assistant</span>
        <div className="flex gap-2">
          <Link to="/login" className="btn-secondary">Login</Link>
          <Link to="/register" className="btn-primary">Get started</Link>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Your legal rights & government services, simplified</h1>
        <p className="mt-4 text-lg text-slate-600">
          Ask questions, check required documents, find offices and track your applications — all in one place.
        </p>
        <Link to="/register" className="btn-primary mt-8 !px-6 !py-3 !text-base">Create free account</Link>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-16 sm:grid-cols-2">
        {features.map(([icon, title, text]) => (
          <div key={title} className="card">
            <div className="text-2xl">{icon}</div>
            <h3 className="mt-2 font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-slate-600">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}