import React, { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';

const STARTERS = [
  'What is the total payroll cost this cycle?',
  'Are there any anomalies I should review?',
  'What is our compliance risk in the UAE and Saudi Arabia?',
  'What is our end-of-service gratuity liability?',
  'How does US income tax withholding work here?',
];

export default function Assistant() {
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'I have live access to payroll, headcount, and compliance data across all seven entities. Ask me anything — total cost, anomalies, risk by country, or a specific employee.', provider: 'local' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  const send = async (text) => {
    const q = text ?? input;
    if (!q.trim() || busy) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput(''); setBusy(true);
    try {
      const r = await api.ai.ask(q);
      setMessages((m) => [...m, { role: 'ai', text: r.answer, provider: r.provider, note: r.note }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'ai', text: `Something went wrong: ${e.message}`, provider: 'local' }]);
    } finally { setBusy(false); setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth' }), 50); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>AI assistant</h1>
          <p>Grounded in this instance's live employees, pay history, and jurisdiction rules — not general knowledge.</p>
        </div>
      </div>

      <div className="panel">
        <div className="chat">
          {messages.map((m, i) => (
            <div className={`msg ${m.role}`} key={i}>
              {m.text}
              {m.role === 'ai' && <span className="prov">{m.provider === 'anthropic' ? 'Claude · live analysis' : 'Local analytical mode'}{m.note ? ` · ${m.note}` : ''}</span>}
            </div>
          ))}
          {busy && <div className="msg ai faint">Thinking…</div>}
          <div ref={end} />
        </div>

        <div className="suggest" style={{ margin: '14px 0' }}>
          {STARTERS.map((s) => <button key={s} className="btn sm" onClick={() => send(s)}>{s}</button>)}
        </div>

        <div className="row">
          <input className="input" placeholder="Ask about cost, risk, an employee, or a policy…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <button className="btn primary" onClick={() => send()} disabled={busy}><Icon.Send style={{ width: 16, height: 16 }} /></button>
        </div>
      </div>
    </div>
  );
}
