import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend } from 'recharts';
import { api } from '../lib/api.js';
import { useApp } from '../lib/AppContext.jsx';
import { Icon } from '../components/Icon.jsx';

const SUGGESTIONS = [
  'Generate a payroll cost and compliance summary for the board',
  'Report on overtime exposure and policy exceptions this cycle',
  'How is our end-of-service liability trending across the Gulf entities?',
  'Give me a workforce composition report by department and country',
  'Forecast our payroll cost trajectory for the next two quarters',
  'Summarize AI-flagged anomalies for this pay cycle',
];
const PALETTE = ['#17603f', '#a8781d', '#2a5d8f', '#b23a2c', '#5b8c6e', '#c9a24a', '#6f9bc4', '#8a968f'];
const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };

/** Pick a chart renderer based on the section heading and shape its table into chart data. */
function SectionChart({ section }) {
  const h = section.heading.toLowerCase();
  const rows = section.table?.rows ?? [];
  if (!rows.length) return null;

  if (h.includes('cost') && !h.includes('trajectory') && !h.includes('forecast')) {
    const data = rows.map((r) => ({ name: r[0], value: num(r[3] ?? r[2]) }));
    return (
      <div className="row" style={{ gap: 20, alignItems: 'center' }}>
        <ResponsiveContainer width={220} height={200}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => v.toLocaleString()} contentStyle={{ borderRadius: 10, border: '1px solid #dfe5e0', fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="row wrap" style={{ gap: 8, flex: 1 }}>
          {data.map((d, i) => <span key={d.name} className="chip" style={{ borderColor: PALETTE[i % PALETTE.length] }}><span style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE[i % PALETTE.length], display: 'inline-block', marginRight: 5 }} />{d.name}</span>)}
        </div>
      </div>
    );
  }
  if (h.includes('trajectory') || h.includes('forecast')) {
    const data = rows.map((r) => ({ period: r[0], cost: num(r[1]), type: r[2] }));
    return (
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid stroke="#e9ede9" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#8a968f' }} axisLine={{ stroke: '#dfe5e0' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#8a968f' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
          <Tooltip formatter={(v) => v.toLocaleString()} contentStyle={{ borderRadius: 10, border: '1px solid #dfe5e0', fontSize: 12 }} />
          <Line type="monotone" dataKey="cost" stroke="#17603f" strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  if (h.includes('complian') || h.includes('risk')) {
    const data = rows.map((r) => ({ name: r[0], score: num(r[1]), grade: r[2] }));
    return (
      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={data}>
          <CartesianGrid stroke="#e9ede9" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#4c5a53' }} axisLine={{ stroke: '#dfe5e0' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#8a968f' }} axisLine={false} tickLine={false} domain={[0, 100]} />
          <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #dfe5e0', fontSize: 12 }} />
          <Bar dataKey="score" radius={[5, 5, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.score >= 90 ? '#17603f' : d.score >= 75 ? '#a8781d' : '#b23a2c'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if (h.includes('workforce') || h.includes('headcount')) {
    const data = rows.slice(0, 8).map((r) => ({ name: r[0], value: num(r[1]) }));
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#4c5a53' }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #dfe5e0', fontSize: 12 }} />
          <Bar dataKey="value" fill="#17603f" radius={[0, 5, 5, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if (h.includes('overtime')) {
    const data = rows.map((r) => ({ name: r[0], hours: num(r[2]), exceptions: num(r[3]) }));
    return (
      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={data}>
          <CartesianGrid stroke="#e9ede9" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#4c5a53' }} axisLine={{ stroke: '#dfe5e0' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#8a968f' }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #dfe5e0', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="hours" name="OT hours" fill="#2a5d8f" radius={[4, 4, 0, 0]} />
          <Bar dataKey="exceptions" name="Exceptions" fill="#b23a2c" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if (h.includes('gratuity') || h.includes('liability')) {
    const data = rows.map((r) => ({ name: r[0], value: num(r[1]) }));
    return (
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data}>
          <CartesianGrid stroke="#e9ede9" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#4c5a53' }} axisLine={{ stroke: '#dfe5e0' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#8a968f' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v) => v.toLocaleString()} contentStyle={{ borderRadius: 10, border: '1px solid #dfe5e0', fontSize: 12 }} />
          <Bar dataKey="value" fill="#a8781d" radius={[5, 5, 0, 0]} barSize={40} />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return null;
}

export default function AiReports() {
  const { notify, can } = useApp();
  const canGenerate = can('admin', 'payroll_admin', 'hr_manager');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [active, setActive] = useState(null);
  const [history, setHistory] = useState([]);

  const loadHistory = () => api.ai.reports.list().then(setHistory);
  useEffect(() => { loadHistory(); }, []);

  const generate = async (text) => {
    const q = text ?? prompt;
    if (!q.trim() || generating) return;
    setGenerating(true);
    try {
      const report = await api.ai.reports.generate(q);
      setActive(report);
      setPrompt('');
      loadHistory();
    } catch (e) { notify(e.message); }
    finally { setGenerating(false); }
  };

  const openReport = async (id) => {
    try { setActive(await api.ai.reports.get(id)); } catch (e) { notify(e.message); }
  };

  const removeReport = async (id, e) => {
    e.stopPropagation();
    try { await api.ai.reports.remove(id); if (active?.id === id) setActive(null); loadHistory(); notify('Report deleted'); }
    catch (err) { notify(err.message); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>AI reports</h1>
          <p>Ask for any report in plain language — generated at runtime from this instance's live payroll data, with charts and a clear explanation for senior management.</p>
        </div>
      </div>
      {!canGenerate && <div className="note" style={{ marginBottom: 18 }}>Read-only for your role. HR managers, Payroll admins, and Administrators can generate new reports.</div>}

      {canGenerate && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="row">
            <input className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && generate()} placeholder="e.g. Generate a payroll cost and compliance summary for the board" />
            <button className="btn primary" disabled={generating} onClick={() => generate()}>{generating ? 'Generating…' : 'Generate'}</button>
          </div>
          <div className="suggest" style={{ marginTop: 12 }}>
            {SUGGESTIONS.map((s) => <button key={s} className="btn sm" disabled={generating} onClick={() => generate(s)}>{s}</button>)}
          </div>
        </div>
      )}

      <div className="grid cols-3">
        <div className="panel" style={{ gridColumn: 'span 1' }}>
          <div className="panel-head"><h2>History</h2><span className="faint">{history.length}</span></div>
          {history.length === 0 && <p className="muted">No reports generated yet.</p>}
          <div className="list">
            {history.map((r) => (
              <div key={r.id} className="item click" style={{ cursor: 'pointer' }} onClick={() => openReport(r.id)}>
                <span className="dot" style={{ background: r.provider === 'anthropic' ? 'var(--blue)' : 'var(--ink-3)' }} />
                <div>
                  <div className="t" style={{ fontSize: 13 }}>{r.title}</div>
                  <div className="s">{r.sectionCount} section{r.sectionCount === 1 ? '' : 's'} · {new Date(r.createdAt).toLocaleString()}</div>
                </div>
                <button className="btn sm danger" onClick={(e) => removeReport(r.id, e)}>×</button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ gridColumn: 'span 2' }}>
          {!active && (
            <div className="panel"><p className="muted">Generate a report above, or pick one from history, to see it here.</p></div>
          )}
          {active && (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>{active.title}</h2>
                  <span className="faint">{active.provider === 'anthropic' ? 'Claude-generated' : 'Local analytical engine'} · {new Date(active.createdAt).toLocaleString()}</span>
                </div>
                <div className="row">
                  <a className="btn sm" href={api.ai.reports.xlsxUrl(active.id)} target="_blank" rel="noreferrer"><Icon.Download style={{ width: 14, height: 14 }} /> Export XLSX</a>
                  <a className="btn sm" href={api.ai.reports.pdfUrl(active.id)} target="_blank" rel="noreferrer"><Icon.Download style={{ width: 14, height: 14 }} /> Export PDF</a>
                </div>
              </div>
              <p style={{ marginBottom: 18, color: 'var(--ink-2)' }}>{active.content.executiveSummary}</p>

              {active.content.sections.map((s, i) => (
                <div key={i} style={{ marginBottom: 24, paddingBottom: 20, borderBottom: i < active.content.sections.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <h3 style={{ marginBottom: 8 }}>{s.heading}</h3>
                  <p style={{ color: 'var(--ink-2)', marginBottom: 12 }}>{s.narrative}</p>
                  {s.metrics?.length > 0 && (
                    <div className="row wrap" style={{ gap: 10, marginBottom: 14 }}>
                      {s.metrics.map((m, j) => <span key={j} className="chip green">{m.label}: {m.value}</span>)}
                    </div>
                  )}
                  <div style={{ marginBottom: 14 }}><SectionChart section={s} /></div>
                  {s.table?.rows?.length > 0 && (
                    <table className="table">
                      <thead><tr>{s.table.headers.map((h, j) => <th key={j} className={j > 0 ? 'r' : ''}>{h}</th>)}</tr></thead>
                      <tbody>
                        {s.table.rows.slice(0, 10).map((row, ri) => (
                          <tr key={ri}>{row.map((cell, ci) => <td key={ci} className={ci > 0 ? 'r num' : ''}>{String(cell)}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
