import { Link } from 'react-router-dom';
import { getVisibleVerifiedSources, parseAnswerMarkdown } from '../utils/safeMarkdown.js';

function renderInline(nodes, keyPrefix) {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === 'strong') return <strong key={key}>{node.value}</strong>;
    if (node.type === 'em') return <em key={key}>{node.value}</em>;
    if (node.type === 'code') return <code key={key} className="rounded bg-slate-100 px-1">{node.value}</code>;
    if (node.type === 'link') return <a key={key} href={node.url} target="_blank" rel="noreferrer" className="text-indigo-600 underline">{node.label}</a>;
    return node.value;
  });
}

function renderAnswer(content, sources) {
  const urls = (sources || []).map((source) => source.sourceUrl || source.source_url).filter(Boolean);
  return parseAnswerMarkdown(content, urls).map((block, index) => {
    const key = `answer-${index}`;
    if (block.type === 'heading') {
      const Tag = `h${block.level + 2}`;
      return <Tag key={key} className="my-2 font-semibold">{renderInline(block.children, key)}</Tag>;
    }
    if (block.type === 'ul' || block.type === 'ol') {
      const Tag = block.type;
      const listStyle = block.type === 'ol' ? 'list-decimal' : 'list-disc';
      return <Tag key={key} className={`my-2 list-inside ${listStyle} space-y-1`}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>)}</Tag>;
    }
    if (block.type === 'table') {
      return (
        <div key={key} className="my-2 overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead><tr>{block.headers.map((cell, cellIndex) => <th key={`${key}-h-${cellIndex}`} className="border border-slate-300 bg-slate-100 px-2 py-1 font-semibold">{renderInline(cell, `${key}-h-${cellIndex}`)}</th>)}</tr></thead>
            <tbody>{block.rows.map((row, rowIndex) => <tr key={`${key}-r-${rowIndex}`}>{block.headers.map((_, cellIndex) => <td key={`${key}-r-${rowIndex}-c-${cellIndex}`} className="border border-slate-300 px-2 py-1">{renderInline(row[cellIndex] || [], `${key}-r-${rowIndex}-c-${cellIndex}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    return <p key={key} className="my-1">{renderInline(block.children, key)}</p>;
  });
}

export default function ChatMessage({ message, onEscalate }) {
  const isUser = message.sender === 'USER';
  const meta = message.meta;
  const verifiedSources = getVisibleVerifiedSources(meta?.sources || []);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm md:max-w-[70%] ${
          isUser ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-800'
        }`}
      >
        <div className="whitespace-pre-wrap">{renderAnswer(message.content, meta?.sources)}</div>

        {!isUser && meta && (
          <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
            {meta.generationStatus === 'fallback' && meta.generationFallbackReason && (
              <p className="text-xs text-amber-700">AI drafting was unavailable; this is a direct summary of the verified passages available.</p>
            )}
            {typeof meta.confidence === 'number' && (
              <p className="text-xs text-slate-500">Evidence match score: {meta.confidence.toFixed(2)}</p>
            )}

            {verifiedSources.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-700">✓ Verified Sources</p>
                <ul className="space-y-1">
                  {verifiedSources.map((s, index) => (
                    <li key={s.id || `${s.title}-${index}`} className="text-xs">
                      {s.sourceUrl ? (
                        <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="text-indigo-600 underline">
                          {s.title || s.sourceUrl}
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
