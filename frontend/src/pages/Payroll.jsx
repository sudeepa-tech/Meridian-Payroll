import React, { useEffect, useState } from 'react';
import { api, fmtMoney } from '../lib/api.js';
import { useApp } from '../lib/AppContext.jsx';
import { Icon } from '../components/Icon.jsx';

export default function Payroll() {
  const { country, activeCountry, notify, can } = useApp();
  const canRun = can('payroll_admin', 'admin');
  const [period, setPeriod] = useState('2026-09');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const [emailingAll, setEmailingAll] = useState(false);
  const [emailSummary, setEmailSummary] = useState(null);
  const [scope, setScope] = useState('country');

  const runPreview = () => {
    setLoading(true); setLastRun(null);
    api.payroll.preview({ country: scope === 'country' ? country : undefined, period }).then((p) => { setPreview(p); setLoading(false); });
  };
  useEffect(runPreview, [country, period, scope]);

  const blocking = preview?.anomalies.filter((a) => a.kind === 'compliance' && a.score >= 0.9) ?? [];

  const approve = async (force) => {
    setRunning(true);
    try {
      const run = await api.payroll.run({ country: scope === 'country' ? country : undefined, period, approve: force });
      setLastRun(run);
      notify(`Pay run ${run.id} approved`);
      runPreview();
    } catch (e) {
      if (e.status === 400 && !force) notify('Blocked by compliance warnings — resolve or override');
      else notify(e.message);
    } finally { setRunning(false); }
  };

  const emailAllPayslips = async () => {
    setEmailingAll(true); setEmailSummary(null);
    try {
      const res = await api.payroll.emailPayslipsBulk(scope === 'country' ? country : undefined, period);
      setEmailSummary(res);
      notify(`Processed ${res.records.length} payslip email${res.records.length === 1 ? '' : 's'}`);
    } catch (e) { notify(e.message); }
    finally { setEmailingAll(false); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Run payroll</h1>
          <p>AI reviews every line for statistical outliers and jurisdiction rules before you approve.</p>
        </div>
        <div className="row">
          <input className="input" style={{ width: 120 }} value={period} onChange={(e) => setPeriod(e.target.value)} />
          <select className="input" style={{ width: 150 }} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="country">{activeCountry?.name ?? 'This country'}</option>
            <option value="all">All entities</option>
          </select>
        </div>
      </div>

      {loading && <p className="muted">Calculating…</p>}

      {preview && !loading && (
        <>
          <div className="grid cols-4">
            {preview.totals.map((t) => (
              <div className="panel stat-card" key={t.currency}>
                <small>{t.currency} net pay</small>
                <b>{fmtMoney(t.net, t.currency, t.currency === 'KWD' || t.currency === 'BHD' || t.currency === 'OMR' ? 3 : 2)}</b>
                <i>{t.headcount} employees</i>
              </div>
            ))}
            <div className="panel stat-card" style={{ background: 'var(--green-2)', borderColor: 'transparent' }}>
              <small>Consolidated employer cost</small>
              <b>{fmtMoney(preview.consolidated.employerCost, preview.consolidated.currency, 0)}</b>
              <i>{preview.consolidated.currency}</i>
            </div>
          </div>

          <div className="grid cols-2" style={{ marginTop: 16 }}>
            <div className="panel">
              <div className="panel-head">
                <h2>AI review</h2>
                <span className={`chip ${blocking.length ? 'red' : 'green'}`}>{blocking.length ? `${blocking.length} blocking` : 'Clear to approve'}</span>
              </div>
              {!canRun && <div className="note" style={{ marginBottom: 12 }}>Your role ({can('viewer') ? 'Viewer' : 'HR manager'}) can preview payroll but not approve a run. Sign in as Payroll admin or Administrator to approve.</div>}
              {preview.anomalies.length === 0 && <p className="muted">No anomalies found across {preview.results.length} employees.</p>}
              <div className="list">
                {preview.anomalies.slice(0, 8).map((a, i) => (
                  <div className="item" key={i}>
                    <span className="dot" style={{ background: a.kind === 'compliance' ? 'var(--red)' : a.kind === 'policy' ? 'var(--gold)' : 'var(--blue)' }} />
                    <div>
                      <div className="t">{a.title} · {a.name}</div>
                      <div className="d">{a.detail}</div>
                      <div className="s">{a.suggestion}</div>
                    </div>
                    <span className="chip">{Math.round(a.score * 100)}%</span>
                  </div>
                ))}
              </div>
              <div className="row" style={{ marginTop: 16 }}>
                {!lastRun ? (
                  <>
                    <button className="btn primary" disabled={running || blocking.length > 0 || !canRun} onClick={() => approve(false)}>
                      <Icon.Check style={{ width: 16, height: 16 }} /> Approve &amp; run
                    </button>
                    {blocking.length > 0 && canRun && (
                      <button className="btn danger" disabled={running} onClick={() => approve(true)}>Override and run anyway</button>
                    )}
                  </>
                ) : (
                  <>
                    <a className="btn" href={api.payroll.wpsUrl(lastRun.id)} target="_blank" rel="noreferrer"><Icon.Download style={{ width: 16, height: 16 }} /> Download WPS/SIF file</a>
                    {canRun && <button className="btn" disabled={emailingAll} onClick={emailAllPayslips}>{emailingAll ? 'Sending…' : 'Email all payslips'}</button>}
                  </>
                )}
              </div>
              {emailSummary && (
                <div className="note" style={{ marginTop: 12 }}>
                  {emailSummary.sent > 0 && `${emailSummary.sent} sent. `}
                  {emailSummary.dryRun > 0 && `${emailSummary.dryRun} composed but not sent — SMTP not configured on this server. `}
                  {emailSummary.failed > 0 && `${emailSummary.failed} failed.`}
                </div>
              )}
            </div>

            <div className="panel">
              <div className="panel-head"><h2>Payroll register</h2></div>
              <table className="table">
                <thead><tr><th>Employee</th><th className="r">Gross</th><th className="r">Deductions</th><th className="r">Net</th></tr></thead>
                <tbody>
                  {preview.results.slice(0, 12).map((r) => (
                    <tr key={r.employeeId}>
                      <td>{r.name}<span className="sub">{r.country}</span></td>
                      <td className="r num">{fmtMoney(r.earnings.gross, r.currency, r.decimals)}</td>
                      <td className="r num">{fmtMoney(r.deductions.total, r.currency, r.decimals)}</td>
                      <td className="r num"><b>{fmtMoney(r.net, r.currency, r.decimals)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.results.length > 12 && <p className="faint" style={{ marginTop: 8 }}>+{preview.results.length - 12} more employees included in totals</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
