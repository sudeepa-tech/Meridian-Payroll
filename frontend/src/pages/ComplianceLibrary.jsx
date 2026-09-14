import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/AppContext.jsx';
import { Icon } from '../components/Icon.jsx';

const CONFIDENCE_COLOR = { high: 'green', medium: 'gold', low: '' };

export default function ComplianceLibrary() {
  const { countries, notify, can } = useApp();
  const canCheck = can('admin', 'payroll_admin', 'hr_manager');
  const [country, setCountry] = useState('US');
  const [state, setState] = useState('');
  const [states, setStates] = useState([]);
  const [effective, setEffective] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checks, setChecks] = useState([]);
  const [activeCheck, setActiveCheck] = useState(null);

  useEffect(() => {
    api.compliance.states(country).then((s) => { setStates(s); setState(''); });
    api.compliance.get(country).then((d) => setEffective(d.effective));
    api.compliance.checks(country).then((list) => { setChecks(list); setActiveCheck(list[0] ?? null); });
  }, [country]);

  const runCheck = async () => {
    setChecking(true);
    try {
      const record = await api.compliance.checkUpdates(country, state || undefined);
      setActiveCheck(record);
      setChecks((c) => [record, ...c]);
      notify(record.provider === 'local' ? 'AI check needs an API key on the server — see the summary below' : `Check complete via ${record.provider}`);
    } catch (e) { notify(e.message); }
    finally { setChecking(false); }
  };

  const activeCountry = countries.find((c) => c.code === country);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Compliance library</h1>
          <p>Browse statutory labor law by country and state, and ask AI to check for recent changes against what this system has configured.</p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="grid cols-3">
          <div className="field">
            <label>Country</label>
            <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>State {states.length === 0 && <span className="faint">(not applicable)</span>}</label>
            <select className="input" value={state} onChange={(e) => setState(e.target.value)} disabled={states.length === 0}>
              <option value="">All / statewide default</option>
              {states.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label>&nbsp;</label>
            {canCheck ? (
              <button className="btn primary" disabled={checking} onClick={runCheck}><Icon.Spark style={{ width: 16, height: 16 }} /> {checking ? 'Checking…' : 'AI: check for law changes'}</button>
            ) : <span className="faint">Sign in as HR/Payroll/Admin to run a check</span>}
          </div>
        </div>
      </div>

      <div className="grid cols-3">
        <div className="panel" style={{ gridColumn: 'span 2' }}>
          <div className="panel-head"><h2>{activeCountry?.name}{state ? ` — ${state}` : ''}: statutory configuration</h2></div>
          {!effective ? <p className="muted">Loading…</p> : (
            <div className="list">
              <div className="item"><span className="dot" style={{ background: 'var(--blue)' }} /><div><div className="t">Overtime</div><div className="d">{effective.overtime.basis === 'daily' ? `Beyond ${effective.overtime.threshold}h/day` : `Beyond ${effective.overtime.threshold}h/week`} at {effective.overtime.multiplier}×{effective.overtime.nightMultiplier ? `, ${effective.overtime.nightMultiplier}× at night` : ''}</div></div></div>
              {effective.minimumWage?.amount != null && <div className="item"><span className="dot" style={{ background: 'var(--gold)' }} /><div><div className="t">Minimum wage</div><div className="d">{effective.minimumWage.amount} / {effective.minimumWage.unit}</div></div></div>}
              {effective.socialSecurity && <div className="item"><span className="dot" style={{ background: 'var(--green)' }} /><div><div className="t">{effective.socialSecurity.name}</div><div className="d">{(effective.socialSecurity.employee ?? []).map((l) => `Employee ${l.label}: ${(l.rate * 100).toFixed(1)}%`).join(', ') || 'No employee contribution'}</div></div></div>}
              {effective.endOfService?.enabled && <div className="item"><span className="dot" style={{ background: 'var(--gold)' }} /><div><div className="t">End-of-service gratuity</div><div className="d">{effective.endOfService.tiers.map((t) => `${t.daysPerYear} days/yr`).join(' → ')}, basis: {effective.endOfService.basis}</div></div></div>}
              {effective.leave?.annual && <div className="item"><span className="dot" style={{ background: 'var(--blue)' }} /><div><div className="t">Annual leave</div><div className="d">{effective.leave.annual.accrualDaysPerYear} days/yr</div></div></div>}
              <div className="item"><span className="dot" style={{ background: effective.incomeTax?.enabled ? 'var(--red)' : 'var(--green)' }} /><div><div className="t">Personal income tax</div><div className="d">{effective.incomeTax?.enabled ? 'Enabled' : (effective.incomeTax?.scheduled ? `None yet — ${effective.incomeTax.note}` : 'None')}</div></div></div>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Check history</h2></div>
          {checks.length === 0 && <p className="muted">No AI checks run yet for this country.</p>}
          <div className="list">
            {checks.map((c) => (
              <div key={c.id} className="item click" style={{ cursor: 'pointer' }} onClick={() => setActiveCheck(c)}>
                <span className="dot" style={{ background: c.findings.changes.length ? 'var(--gold)' : 'var(--green)' }} />
                <div><div className="t" style={{ fontSize: 13 }}>{c.state ? `${c.state} · ` : ''}{c.findings.changes.length} change{c.findings.changes.length === 1 ? '' : 's'} flagged</div><div className="s">{new Date(c.createdAt).toLocaleString()} · {c.provider}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {activeCheck && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head"><h2>AI findings</h2><span className={`chip ${activeCheck.provider === 'anthropic-websearch' ? 'blue' : activeCheck.provider === 'local' ? 'gold' : ''}`}>{activeCheck.provider}</span></div>
          <p style={{ color: 'var(--ink-2)', marginBottom: 14 }}>{activeCheck.findings.summary}</p>
          {activeCheck.findings.changes.length > 0 && (
            <div className="list" style={{ marginBottom: 14 }}>
              {activeCheck.findings.changes.map((ch, i) => (
                <div className="item" key={i}>
                  <span className="dot" style={{ background: ch.actionNeeded ? 'var(--red)' : 'var(--gold)' }} />
                  <div>
                    <div className="row"><span className="t">{ch.area}</span><span className={`chip ${CONFIDENCE_COLOR[ch.confidence] ?? ''}`}>{ch.confidence} confidence</span>{ch.actionNeeded && <span className="chip red">Action needed</span>}</div>
                    <div className="d">Currently configured: {ch.current}</div>
                    <div className="d"><b>AI found:</b> {ch.finding}</div>
                    {ch.effectiveDate && <div className="s">Effective {ch.effectiveDate}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {activeCheck.findings.sources?.length > 0 && (
            <div>
              <p className="faint" style={{ marginBottom: 6 }}>Sources</p>
              <div className="row wrap" style={{ gap: 8 }}>
                {activeCheck.findings.sources.map((s, i) => <a key={i} className="chip" href={s.url} target="_blank" rel="noreferrer">{s.title}</a>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
