import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend } from 'recharts';
import { api, fmtMoney, fmtNum } from '../lib/api.js';
import { useApp } from '../lib/AppContext.jsx';
import { Icon } from '../components/Icon.jsx';

const PALETTE = ['#17603f', '#a8781d', '#2a5d8f', '#b23a2c', '#5b8c6e', '#c9a24a', '#6f9bc4', '#8a968f'];

export default function Reports() {
  const { settings, notify } = useApp();
  const [dash, setDash] = useState(null);
  const [history, setHistory] = useState(null);
  const [risks, setRisks] = useState(null);
  const [attendance, setAttendance] = useState(null);

  useEffect(() => {
    Promise.all([api.payroll.dashboard(), api.payroll.history(), api.ai.risks(), api.attendance.overview()])
      .then(([d, h, r, a]) => { setDash(d); setHistory(h); setRisks(r); setAttendance(a); });
  }, []);

  if (!dash || !history || !risks || !attendance) return <div className="page"><p className="muted">Building reports…</p></div>;

  const rc = dash.consolidated.currency;
  const pieData = dash.byCountry.map((b) => ({ name: b.country, value: Math.round(b.reporting) }));
  const trendData = history.periods.map((p) => ({ name: p.period.slice(5), gross: Math.round(p.gross), net: Math.round(p.net), cost: Math.round(p.employerCost) }));
  const riskBar = risks.map((r) => ({ name: r.country, score: r.score }));
  const otBar = attendance.byCountry.map((b) => ({ name: b.country, overtime: Math.round(b.overtimeHours), late: b.lateCount, absent: b.absentDays }));

  const download = (url, label) => { window.open(url, '_blank'); notify(`Downloading ${label}…`); };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p>Enterprise reporting across cost, compliance, and workforce — export anything to PDF or Excel.</p>
        </div>
        <div className="row wrap">
          <button className="btn" onClick={() => download(api.reports.summaryPdfUrl({ period: dash.period }), 'payroll summary PDF')}><Icon.Download style={{ width: 16, height: 16 }} /> Summary PDF</button>
          <button className="btn" onClick={() => download(api.reports.registerXlsxUrl({ period: dash.period }), 'payroll register XLSX')}><Icon.Download style={{ width: 16, height: 16 }} /> Register XLSX</button>
          <button className="btn" onClick={() => download(api.reports.costXlsxUrl(), 'cost by country XLSX')}><Icon.Download style={{ width: 16, height: 16 }} /> Cost trend XLSX</button>
          <button className="btn" onClick={() => download(api.reports.riskPdfUrl(), 'compliance risk PDF')}><Icon.Download style={{ width: 16, height: 16 }} /> Risk report PDF</button>
        </div>
      </div>

      <div className="grid cols-3">
        <div className="panel span-2">
          <div className="panel-head"><h2>Gross, net &amp; employer cost trend</h2><span className="chip">{rc}</span></div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData}>
              <CartesianGrid stroke="#e9ede9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#8a968f' }} axisLine={{ stroke: '#dfe5e0' }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#8a968f' }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => fmtMoney(v, rc, 0)} contentStyle={{ borderRadius: 10, border: '1px solid #dfe5e0', fontSize: 13 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="cost" name="Employer cost" stroke="#17603f" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="gross" name="Gross" stroke="#2a5d8f" strokeWidth={2} dot={{ r: 2.5 }} strokeDasharray="4 3" />
              <Line type="monotone" dataKey="net" name="Net" stroke="#a8781d" strokeWidth={2} dot={{ r: 2.5 }} strokeDasharray="4 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Cost share by entity</h2></div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86} paddingAngle={2}>
                {pieData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtMoney(v, rc, 0)} contentStyle={{ borderRadius: 10, border: '1px solid #dfe5e0', fontSize: 13 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="row wrap" style={{ gap: 10, marginTop: 4 }}>
            {pieData.map((p, i) => (
              <span key={p.name} className="row" style={{ gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: PALETTE[i % PALETTE.length], display: 'inline-block' }} />{p.name}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-head"><h2>Compliance risk score by country</h2></div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={riskBar}>
              <CartesianGrid stroke="#e9ede9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#4c5a53' }} axisLine={{ stroke: '#dfe5e0' }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#8a968f' }} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #dfe5e0', fontSize: 13 }} />
              <Bar dataKey="score" radius={[5, 5, 0, 0]}>
                {riskBar.map((r, i) => <Cell key={i} fill={r.score >= 90 ? '#17603f' : r.score >= 75 ? '#a8781d' : '#b23a2c'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Overtime &amp; attendance exceptions</h2></div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={otBar}>
              <CartesianGrid stroke="#e9ede9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#4c5a53' }} axisLine={{ stroke: '#dfe5e0' }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#8a968f' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #dfe5e0', fontSize: 13 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="overtime" name="OT hours" fill="#2a5d8f" radius={[4, 4, 0, 0]} />
              <Bar dataKey="late" name="Late" fill="#a8781d" radius={[4, 4, 0, 0]} />
              <Bar dataKey="absent" name="Absent" fill="#b23a2c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><h2>Report library</h2></div>
        <table className="table">
          <thead><tr><th>Report</th><th>Format</th><th>Scope</th><th></th></tr></thead>
          <tbody>
            <tr><td><b>Payroll summary</b><span className="sub">Consolidated totals, by-entity breakdown, AI flags</span></td><td><span className="chip">PDF</span></td><td>Current cycle</td><td className="r"><button className="btn sm" onClick={() => download(api.reports.summaryPdfUrl({ period: dash.period }), 'summary')}>Export</button></td></tr>
            <tr><td><b>Payroll register</b><span className="sub">Line-by-line earnings, deductions, employer cost</span></td><td><span className="chip">XLSX</span></td><td>Current cycle</td><td className="r"><button className="btn sm" onClick={() => download(api.reports.registerXlsxUrl({ period: dash.period }), 'register')}>Export</button></td></tr>
            <tr><td><b>Cost by country trend</b><span className="sub">Monthly employer cost, all entities</span></td><td><span className="chip">XLSX</span></td><td>8-month history</td><td className="r"><button className="btn sm" onClick={() => download(api.reports.costXlsxUrl(), 'cost')}>Export</button></td></tr>
            <tr><td><b>Compliance risk report</b><span className="sub">Score, grade and open issues per entity</span></td><td><span className="chip">PDF</span></td><td>All entities</td><td className="r"><button className="btn sm" onClick={() => download(api.reports.riskPdfUrl(), 'risk')}>Export</button></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
