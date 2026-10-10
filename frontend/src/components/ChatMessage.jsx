import { Link } from 'react-router-dom';

export default function ChatMessage({ message, onEscalate }) {
  const isUser = message.sender === 'USER';
  const meta = message.meta;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm md:max-w-[70%] ${
          isUser ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-800'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {!isUser && meta && (
          <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
            {typeof meta.confidence === 'number' && (
              <p className="text-xs text-slate-500">Confidence: {Math.round(meta.confidence * 100)}%</p>
            )}

            {meta.sources?.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-700">✓ Verified Sources</p>
                <ul className="space-y-1">
                  {meta.sources.map((s) => (
                    <li key={s.id} className="text-xs">
                      {s.sourceUrl ? (
                        <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="text-indigo-600 underline">
                          {s.title}
                        </a>
                      ) : (
                        s.title
                      )}
                      {s.department && <span className="text-slate-400"> · {s.department}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {meta.suggestedService && (
                <Link to={`/services/${meta.suggestedService.id}`} className="btn-primary !px-3 !py-1.5 !text-xs">
                  View Service: {meta.suggestedService.name}
                </Link>
              )}
              {meta.needsHuman && (
                <button onClick={onEscalate} className="btn-danger !px-3 !py-1.5 !text-xs">
                  Request Human Assistance
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}