import { useEffect, useRef } from 'react';
import { formatDate } from '../utils/helpers.js';

// viewerRole: 'CITIZEN' (citizen portal) or 'AGENT' (admin portal) → decides which side is "mine"
export default function CaseThread({ messages = [], viewerRole = 'CITIZEN' }) {
  const bottomRef = useRef(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!messages.length) return <p className="py-6 text-center text-sm text-slate-400">No messages yet.</p>;

  return (
    <div className="space-y-3">
      {messages.map((m) => {
        const mine = (m.senderRole === 'CITIZEN') === (viewerRole === 'CITIZEN');
        return (
          <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${mine ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white'}`}>
              <p className={`mb-0.5 text-[11px] font-semibold ${mine ? 'text-indigo-200' : 'text-slate-400'}`}>
                {m.senderRole === 'AGENT' ? 'Support Agent' : 'Citizen'}
              </p>
              <p className="whitespace-pre-wrap">{m.message}</p>
              <p className={`mt-1 text-[10px] ${mine ? 'text-indigo-200' : 'text-slate-400'}`}>{formatDate(m.createdAt)}</p>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}