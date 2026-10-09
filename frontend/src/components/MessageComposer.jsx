import { useState } from 'react';

export default function MessageComposer({ onSend, disabled = false, placeholder = 'Type your message...' }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await onSend(value);
      setText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} disabled={disabled || sending} />
      <button className="btn-primary" disabled={disabled || sending || !text.trim()}>
        {sending ? '...' : 'Send'}
      </button>
    </form>
  );
}