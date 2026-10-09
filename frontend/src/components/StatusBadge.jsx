import { prettyStatus } from '../utils/helpers.js';

const COLORS = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  UNDER_VERIFICATION: 'bg-amber-100 text-amber-700',
  UNDER_REVIEW: 'bg-purple-100 text-purple-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  PENDING: 'bg-amber-100 text-amber-700',
  IN_REVIEW: 'bg-blue-100 text-blue-700',
  RESPONDED: 'bg-purple-100 text-purple-700',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-slate-200 text-slate-700',
  UPLOADED: 'bg-blue-100 text-blue-700',
  VERIFIED: 'bg-green-100 text-green-700',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLORS[status] || 'bg-slate-100 text-slate-700'}`}>
      {prettyStatus(status)}
    </span>
  );
}