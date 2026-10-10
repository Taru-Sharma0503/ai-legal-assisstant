import { useState } from 'react';

// `checked` is local UI state only (the API doesn't persist it)
export default function DocumentChecklist({ documents }) {
  const [checked, setChecked] = useState(() => Object.fromEntries(documents.map((d) => [d.id, !!d.checked])));
  const toggle = (id) => setChecked((c) => ({ ...c, [id]: !c[id] }));
  const done = documents.filter((d) => checked[d.id]).length;

  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">
        {done} of {documents.length} documents ready
      </p>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-green-500 transition-all"
          style={{ width: `${documents.length ? (done / documents.length) * 100 : 0}%` }}
        />
      </div>
      <ul className="space-y-2">
        {documents.map((d) => (
          <li key={d.id}>
            <label className="card flex cursor-pointer items-center gap-3 !p-3">
              <input
                type="checkbox"
                checked={!!checked[d.id]}
                onChange={() => toggle(d.id)}
                className="h-4 w-4 accent-indigo-600"
              />
              <span className={checked[d.id] ? 'text-slate-400 line-through' : ''}>{d.name}</span>
              {d.mandatory ? (
                <span className="ml-auto text-xs font-medium text-red-600">Mandatory</span>
              ) : (
                <span className="ml-auto text-xs text-slate-400">Optional</span>
              )}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}