import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import * as aiApi from '../services/aiApi.js';
import { getErrorMessage } from '../services/apiClient.js';
import ChatMessage from '../components/ChatMessage.jsx';
import EscalationModal from '../components/EscalationModal.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import Loader from '../components/Loader.jsx';
import { LANGUAGES } from '../utils/constants.js';
import { formatDate } from '../utils/helpers.js';

export default function Assistant() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState(user?.preferredLanguage || 'en');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showEscalate, setShowEscalate] = useState(false);

  const skipLoadFor = useRef(null); // don't refetch a conversation we just created locally
  const bottomRef = useRef(null);

  const loadConversations = useCallback(async () => {
    try {
      setConversations(await aiApi.getConversations());
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load messages when URL has a conversationId
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    if (skipLoadFor.current === conversationId) {
      skipLoadFor.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const conv = await aiApi.getConversation(conversationId);
        if (!cancelled) {
          setMessages(conv.messages || []);
          if (conv.language) setLanguage(conv.language);
        }
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setError('');
    setInput('');
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, sender: 'USER', content: text }]);

    try {
      let id = conversationId;
      if (!id) {
        const conv = await aiApi.createConversation({ language, title: text.slice(0, 60) });
        id = conv.conversationId;
        skipLoadFor.current = id;
        navigate(`/assistant/${id}`, { replace: true });
      }
      const res = await aiApi.sendMessage(id, { message: text, language });
      setMessages((m) => [
        ...m,
        {
          id: res.messageId,
          sender: 'AI',
          content: res.answer,
          meta: {
            sources: res.sources,
            confidence: res.confidence,
            needsHuman: res.needsHuman,
            suggestedService: res.suggestedService,
          },
        },
      ]);
      loadConversations();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* Conversation history */}
      <aside className="card h-fit max-h-[calc(100vh-9rem)] overflow-y-auto !p-3">
        <Link to="/assistant" className="btn-primary mb-3 w-full">+ New conversation</Link>
        <ul className="space-y-1">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                to={`/assistant/${c.id}`}
                className={`block rounded-lg px-3 py-2 text-sm ${c.id === conversationId ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50'}`}
              >
                <p className="truncate font-medium">{c.title || 'Untitled'}</p>
                <p className="text-[11px] text-slate-400">{formatDate(c.updatedAt)}</p>
              </Link>
            </li>
          ))}
          {conversations.length === 0 && <p className="px-2 text-xs text-slate-400">No conversations yet</p>}
        </ul>
      </aside>

      {/* Chat */}
      <section className="card flex h-[calc(100vh-9rem)] flex-col !p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h1 className="font-semibold">AI Assistant</h1>
          <div className="flex items-center gap-2">
            <select className="input !w-auto !py-1" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            {conversationId && (
              <button className="btn-secondary !py-1" onClick={() => setShowEscalate(true)}>
                Talk to a human
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4">
          {loading && <Loader />}
          {!loading && messages.length === 0 && (
            <div className="py-16 text-center text-slate-400">
              <p className="text-3xl">🤖</p>
              <p className="mt-2 text-sm">Ask about legal rights or government services.</p>
              <p className="text-sm">e.g. "मुझे आय प्रमाण पत्र बनवाना है। कौन से दस्तावेज चाहिए?"</p>
            </div>
          )}
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} onEscalate={() => setShowEscalate(true)} />
          ))}
          {sending && <p className="text-sm text-slate-400">Assistant is typing...</p>}
          <div ref={bottomRef} />
        </div>

        <div className="space-y-2 border-t border-slate-200 p-3">
          <ErrorMessage message={error} />
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              className="input"
              placeholder="Type your question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
            />
            <button className="btn-primary" disabled={sending || !input.trim()}>Send</button>
          </form>
        </div>
      </section>

      {showEscalate && conversationId && (
        <EscalationModal conversationId={conversationId} onClose={() => setShowEscalate(false)} />
      )}
    </div>
  );
}