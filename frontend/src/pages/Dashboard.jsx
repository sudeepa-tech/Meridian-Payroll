import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from 'recharts';
import { api, fmtMoney, fmtNum } from '../lib/api.js';
import { useApp } from '../lib/AppContext.jsx';
import { Icon } from '../components/Icon.jsx';

export default function Dashboard({ goto }) {
  const { settings } = useApp();
  const [dash, setDash] = useState(null);
  const [history, setHistory] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    Promise.all([api.payroll.dashboard(), api.payroll.history(), api.ai.forecast(6)])
      .then(([d, h, f]) => { setDash(d); setHistory(h); setForecast(f); })
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="page"><p className="chip red">{err}</p></div>;
  if (!dash) return <div className="page"><p className="muted">Loading overview…</p></div>;

  const rc = dash.consolidated.currency;
  const chartData = [
    ...(history?.periods ?? []).map((p) => ({ name: p.period.slice(5), value: p.employerCost, kind: 'actual' })),
    ...(forecast?.forecast ?? []).map((p) => ({ name: p.period.slice(5), value: p.value, kind: 'forecast' })),
  ];
  const barData = dash.byCountry.map((b) => ({ name: b.country, cost: Math.round(b.reporting) }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Payroll overview</h1>
          <p>Consolidated across every entity, converted live to {rc}. Current cycle: {dash.period}.</p>
        </div>
        <button className="btn primary" onClick={() => goto('payroll')}><Icon.Play /> Run this cycle</button>
      </div>

      <div className="ledger">
        <div className="lead">
          <small>Total employer cost, {dash.period}</small>
          <h1>{fmtMoney(dash.consolidated.employerCost, rc, 0)}</h1>
        </div>
        <div className="stat">
          <small>Gross pay</small>
          <b>{fmtMoney(dash.consolidated.gross, rc, 0)}</b>
          <i>{fmtNum(dash.headcount)} active employees</i>
        </div>
        <div className="stat">
          <small>Net pay disbursed</small>
          <b>{fmtMoney(dash.consolidated.net, rc, 0)}</b>
          <i>across {dash.byCountry.length} countries</i>
        </div>
        <div className="stat">
          <small>Open flags</small>
          <b>{dash.anomalyCount}</b>
          <i>reviewed by AI before every run</i>
        </div>
      </div>

      <div className="grid cols-3" style={{ marginTop: 16 }}>
        <div className="panel span-2">
          <div className="panel-head">
            <h2>Employer cost trend &amp; forecast</h2>
            <span className="chip blue"><Icon.Spark style={{ width: 13, height: 13 }} /> AI-forecast, 90% band</span>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="#e9ede9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#8a968f' }} axisLine={{ stroke: '#dfe5e0' }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#8a968f' }} axisLine={false} tickLine={false} width={70} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
              <Tooltip formatter={(v) => fmtMoney(v, rc, 0)} contentStyle={{ borderRadius: 10, border: '1px solid #dfe5e0', fontSize: 13 }} />
              <Line type="monotone" dataKey="value" stroke="#17603f" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="faint" style={{ marginTop: 8 }}>{forecast?.narrative}</p>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Cost by country</h2></div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={barData} layout="vertical" margin={{ left: 8 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={34} tick={{ fontSize: 12, fill: '#4c5a53' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => fmtMoney(v, rc, 0)} contentStyle={{ borderRadius: 10, border: '1px solid #dfe5e0', fontSize: 13 }} />
              <Bar dataKey="cost" fill="#17603f" radius={[0, 5, 5, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-head">
            <h2>AI-flagged this cycle</h2>
            <button className="btn sm" onClick={() => goto('payroll')}>Review in run</button>
          </div>
          <div className="list">
            {dash.anomalies.length === 0 && <p className="muted">Nothing unusual detected.</p>}
            {dash.anomalies.map((a, i) => (
              <div className="item" key={i}>
                <span className="dot" style={{ background: a.kind === 'compliance' ? 'var(--red)' : a.kind === 'policy' ? 'var(--gold)' : 'var(--blue)' }} />
                <div>
                  <div className="t">{a.title} · {a.name}</div>
                  <div className="d">{a.detail}</div>
                </div>
                <span className="chip">{a.country}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Compliance risk by country</h2>
            <button className="btn sm" onClick={() => goto('compliance')}>Open rules</button>
          </div>
          <div className="list">
            {dash.risks.map((r) => (
              <div className="item" key={r.country}>
                <span className="dot" style={{ background: r.score >= 90 ? 'var(--green)' : r.score >= 75 ? 'var(--gold)' : 'var(--red)' }} />
                <div style={{ width: '100%' }}>
                  <div className="row"><span className="t">{r.name}</span><span className="faint">{r.headcount} employees</span></div>
                  <div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${r.score}%`, background: r.score >= 90 ? 'var(--green)' : r.score >= 75 ? 'var(--gold)' : 'var(--red)' }} /></div>
                  {r.issues[0] && <div className="s">{r.issues[0].label}</div>}
                </div>
                <span className="chip">{r.grade}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
