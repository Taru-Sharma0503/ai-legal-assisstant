import { Link } from 'react-router-dom';

export default function ServiceCard({ service }) {
  return (
    <Link to={`/services/${service.id}`} className="card block transition hover:border-indigo-300 hover:shadow">
      <h3 className="font-semibold text-slate-900">{service.name}</h3>
      <p className="mt-0.5 text-xs text-indigo-600">{service.department}</p>
      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{service.description}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
        <span className="rounded bg-slate-100 px-2 py-0.5">{service.applicationMethod}</span>
        {service.region && <span className="rounded bg-slate-100 px-2 py-0.5">{service.region}</span>}
      </div>
    </Link>
  );
}