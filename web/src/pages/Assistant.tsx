import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { PERIODS, rangeFor, type PeriodKey } from '../lib/period';

type Message = { id: number; role: 'user' | 'bot'; text: string };

const SUGGESTIONS = [
  'How much did I spend in total?',
  'Which category costs me the most?',
  'Is mahine kitna kharcha hua?',
  'میرا سب سے زیادہ خرچہ کہاں ہوا؟',
];

const ARABIC_LETTER = /[\u0600-\u06FF]/g;
const LATIN_LETTER = /[A-Za-z]/g;

/** Right-to-left only when the text is mostly Urdu script, so mixed English text stays left-to-right. */
function direction(text: string): 'rtl' | 'ltr' {
  const urdu = (text.match(ARABIC_LETTER) ?? []).length;
  const latin = (text.match(LATIN_LETTER) ?? []).length;
  return urdu > latin ? 'rtl' : 'ltr';
}

export default function Assistant() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: 'bot', text: 'Assalam o Alaikum! Ask me anything about your spending, in English, اردو or Roman Urdu.' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>('all');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setMessages((m) => [...m, { id: Date.now(), role: 'user', text: trimmed }]);
    setInput('');
    setBusy(true);
    try {
      const { answer } = await api.ask(trimmed, rangeFor(period));
      setMessages((m) => [...m, { id: Date.now() + 1, role: 'bot', text: answer || 'I couldn’t find an answer to that.' }]);
    } catch (e) {
      setMessages((m) => [...m, { id: Date.now() + 1, role: 'bot', text: `Sorry — ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); void ask(input); };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="overline" style={{ color: 'var(--primary)' }}>English · اردو</span>
          <h1>Assistant</h1>
        </div>
        <label className="field" style={{ minWidth: 160 }}>
          <span className="label">Looking at</span>
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
            {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
      </div>

      <section className="card chat">
        <div className="messages" aria-live="polite">
          {messages.map((m) => (
            <div key={m.id} className={`bubble ${m.role}`} dir={direction(m.text)}>{m.text}</div>
          ))}
          {busy && <div className="bubble bot" aria-label="Thinking">…</div>}
          <div ref={endRef} />
        </div>
        <div>
          {messages.length < 3 && (
            <div className="suggestions" style={{ marginBottom: 10 }}>
              {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => void ask(s)} dir={direction(s)}>{s}</button>)}
            </div>
          )}
          <form className="composer" onSubmit={submit}>
            <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your spending…" aria-label="Your question" dir="auto" />
            <button className="btn btn-primary" disabled={busy || !input.trim()}>Send</button>
          </form>
        </div>
      </section>
      <p className="faint" style={{ fontSize: 13 }}>Answers use only your saved records — HissabAI never invents figures.</p>
    </div>
  );
}
