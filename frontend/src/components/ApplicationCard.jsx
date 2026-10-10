import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge.jsx';
import { formatDate } from '../utils/helpers.js';

export default function ApplicationCard({ application }) {
  return (
    <Link to={`/applications/${application.id}`} className="card flex items-center justify-between gap-3 hover:border-indigo-300">
      <div>
        <h3 className="font-semibold">{application.service?.name}</h3>
        <p className="text-xs text-slate-500">{application.referenceNumber}</p>
        <p className="mt-1 text-xs text-slate-400">Updated {formatDate(application.updatedAt)}</p>
      </div>
      <StatusBadge status={application.status} />
    </Link>
  );
}