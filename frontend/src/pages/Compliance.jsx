import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/AppContext.jsx';
import { Icon } from '../components/Icon.jsx';

const STATUS_COLOR = { pass: 'green', warn: 'gold', fail: 'red', manual: 'blue' };

export default function Compliance() {
  const { country, activeCountry, notify, can } = useApp();
  const canEdit = can('admin');
  const [effective, setEffective] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [draft, setDraft] = useState({});

  const load = () => {
    api.compliance.get(country).then((d) => { setEffective(d.effective); setDraft({}); });
    api.compliance.checklist(country).then(setChecklist);
  };
  useEffect(load, [country]);

  if (!effective) return <div className="page"><p className="muted">Loading rule set…</p></div>;

  const save = async () => {
    const payload = buildOverride(draft, effective);
    await api.compliance.update(country, payload);
    notify(`${activeCountry.name} rules updated`);
    load();
  };
  const resetAll = async () => { await api.compliance.reset(country); notify('Reverted to statutory defaults'); load(); };

  const set = (path, value) => setDraft((d) => ({ ...d, [path]: value }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Rules &amp; compliance — {activeCountry?.name}</h1>
          <p>Statutory defaults for {effective.name}, editable per entity. Changes apply to every payroll run immediately.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={resetAll} disabled={!canEdit}>Reset to statutory defaults</button>
          <button className="btn primary" disabled={!canEdit || !Object.keys(draft).length} onClick={save}><Icon.Check style={{ width: 16, height: 16 }} /> Save changes</button>
        </div>
      </div>

      {!canEdit && <div className="note" style={{ marginBottom: 18 }}>You're viewing in read-only mode. Only an Administrator can edit compliance rules — sign in as admin@meridian.example to make changes.</div>}

      <div className="note" style={{ marginBottom: 18 }}>
        Legal basis: {effective.overtime?.law ?? '—'}{effective.endOfService?.law ? ` · ${effective.endOfService.law}` : ''}. Verify against current statutes with local counsel before production use.
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <div className="panel-head"><h2>Overtime &amp; hours</h2></div>
          <div className="rule-grid">
            <Rule label="Standard week (hours)" value={draft['workWeekHours'] ?? effective.workWeekHours} onChange={(v) => set('workWeekHours', v)} />
            <Rule label="Overtime threshold" value={draft['overtime.threshold'] ?? effective.overtime.threshold} onChange={(v) => set('overtime.threshold', v)} />
            <Rule label="Overtime multiplier" value={draft['overtime.multiplier'] ?? effective.overtime.multiplier} step="0.05" onChange={(v) => set('overtime.multiplier', v)} />
            {effective.overtime.nightMultiplier != null && <Rule label="Night multiplier" value={draft['overtime.nightMultiplier'] ?? effective.overtime.nightMultiplier} step="0.05" onChange={(v) => set('overtime.nightMultiplier', v)} />}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Minimum wage</h2></div>
          {effective.minimumWage?.amount != null ? (
            <div className="rule-grid">
              <Rule label={`Minimum (${effective.minimumWage.unit})`} value={draft['minimumWage.amount'] ?? effective.minimumWage.amount} onChange={(v) => set('minimumWage.amount', v)} />
            </div>
          ) : <p className="muted">No statutory minimum configured for this entity.</p>}
        </div>

        {effective.incomeTax?.enabled && (
          <div className="panel span-2">
            <div className="panel-head"><h2>Income tax brackets (annual)</h2></div>
            <table className="table">
              <thead><tr><th>Up to</th><th className="r">Rate</th></tr></thead>
              <tbody>
                {effective.incomeTax.brackets.map((b, i) => (
                  <tr key={i}><td>{b.upTo ? b.upTo.toLocaleString() : 'and above'}</td><td className="r">{(b.rate * 100).toFixed(0)}%</td></tr>
                ))}
              </tbody>
            </table>
            <p className="faint" style={{ marginTop: 8 }}>Standard deduction: {effective.incomeTax.standardDeduction?.toLocaleString()}. State tax layered separately by employee state.</p>
          </div>
        )}

        {effective.socialSecurity && (
          <div className="panel">
            <div className="panel-head"><h2>{effective.socialSecurity.name} contributions</h2></div>
            <div className="rule-grid">
              {effective.socialSecurity.employee?.map((l) => (
                <Rule key={l.id} label={`Employee — ${l.label}`} value={draft[`socialSecurity.employee.${l.id}`] ?? l.rate} step="0.001" onChange={(v) => set(`socialSecurity.employee.${l.id}`, v)} suffix="rate" />
              ))}
              {effective.socialSecurity.employer?.map((l) => (
                <Rule key={l.id} label={`Employer — ${l.label}`} value={draft[`socialSecurity.employer.${l.id}`] ?? l.rate} step="0.001" onChange={(v) => set(`socialSecurity.employer.${l.id}`, v)} suffix="rate" />
              ))}
            </div>
            {effective.socialSecurity.note && <p className="faint" style={{ marginTop: 8 }}>{effective.socialSecurity.note}</p>}
          </div>
        )}

        {effective.endOfService?.enabled && (
          <div className="panel">
            <div className="panel-head"><h2>End-of-service gratuity</h2></div>
            <div className="rule-grid">
              {effective.endOfService.tiers.map((t, i) => (
                <Rule key={i} label={`Years ${i === 0 ? '0' : effective.endOfService.tiers[i - 1].uptoYears}–${t.uptoYears ?? '∞'}`} value={draft[`endOfService.tiers.${i}`] ?? t.daysPerYear} suffix="days/yr" onChange={(v) => set(`endOfService.tiers.${i}`, v)} />
              ))}
            </div>
            <p className="faint" style={{ marginTop: 8 }}>Basis: {effective.endOfService.basis} salary. Minimum service {effective.endOfService.minServiceYears} yr{effective.endOfService.capMonths ? `, capped at ${effective.endOfService.capMonths} months` : ''}.</p>
          </div>
        )}

        {effective.wageProtection?.required && (
          <div className="panel">
            <div className="panel-head"><h2>Wage protection</h2></div>
            <div className="rule-grid">
              <Rule label="Pay within (days)" value={draft['wageProtection.payWithinDays'] ?? effective.wageProtection.payWithinDays} onChange={(v) => set('wageProtection.payWithinDays', v)} />
            </div>
            <p className="faint" style={{ marginTop: 8 }}>System: {effective.wageProtection.system}. IBAN required for every employee.</p>
          </div>
        )}

        {effective.overtime && (
          <div className="panel">
            <div className="panel-head"><h2>Overtime rounding &amp; caps</h2></div>
            <div className="rule-grid">
              <Rule label="Rounding increment (min)" value={draft['overtime.rounding.increment'] ?? effective.overtime.rounding?.increment ?? 15} onChange={(v) => set('overtime.rounding.increment', v)} />
              {effective.overtime.dailyCap != null && <Rule label="Daily cap (hours)" value={draft['overtime.dailyCap'] ?? effective.overtime.dailyCap} onChange={(v) => set('overtime.dailyCap', v)} />}
            </div>
            <p className="faint" style={{ marginTop: 8 }}>Rounding rule: {effective.overtime.rounding?.rule ?? 'nearest'}. {effective.overtime.requiresPriorApproval ? 'Requires prior manager approval before overtime is worked.' : ''}</p>
          </div>
        )}

        {effective.leave && (
          <div className="panel span-2">
            <div className="panel-head"><h2>Leave entitlements</h2></div>
            <table className="table">
              <thead><tr><th>Type</th><th>Entitlement</th><th>Accrual</th><th>Notes</th></tr></thead>
              <tbody>
                <tr><td>Annual</td><td>{effective.leave.annual.accrualDaysPerYear} days/yr{effective.leave.annual.tiers ? ` (up to ${effective.leave.annual.tiers[0].daysPerYear} after ${effective.leave.annual.tiers[0].afterYears} yrs)` : ''}</td><td>{effective.leave.annual.accrualMethod}</td><td className="faint">{effective.leave.annual.note ?? effective.leave.annual.unit}</td></tr>
                {effective.leave.sick && <tr><td>Sick</td><td>{effective.leave.sick.daysPerYear ?? '—'} days/yr</td><td>{effective.leave.sick.tiers ? effective.leave.sick.tiers.map((t) => `${t.days}d @ ${t.pay * 100}%`).join(' → ') : '—'}</td><td className="faint">{effective.leave.sick.note ?? ''}</td></tr>}
                {effective.leave.maternity && <tr><td>Maternity</td><td>{effective.leave.maternity.weeksPaid}wk paid{effective.leave.maternity.weeksUnpaid ? ` + ${effective.leave.maternity.weeksUnpaid}wk unpaid` : ''}</td><td>—</td><td className="faint">{effective.leave.maternity.note}</td></tr>}
                {effective.leave.paternity && <tr><td>Paternity</td><td>{effective.leave.paternity.weeksPaid || effective.leave.paternity.weeksUnpaid ? `${effective.leave.paternity.weeksPaid}wk` : 'None'}</td><td>—</td><td className="faint">{effective.leave.paternity.note}</td></tr>}
                {effective.leave.public && <tr><td>Public holidays</td><td>{effective.leave.public.daysPerYear} days/yr</td><td>—</td><td className="faint">{effective.leave.public.note ?? ''}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><h2>Live compliance checklist</h2><span className="faint">{checklist?.headcount} active employees</span></div>
        <div className="list">
          {checklist?.items.map((it) => (
            <div className="item" key={it.id}>
              <span className="dot" style={{ background: `var(--${STATUS_COLOR[it.status] === 'gold' ? 'gold' : STATUS_COLOR[it.status]})` }} />
              <div>
                <div className="t">{it.label}</div>
                {it.detail && <div className="d">{it.detail}</div>}
              </div>
              <span className={`chip ${STATUS_COLOR[it.status]}`}>{it.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Rule({ label, value, onChange, step = '1', suffix }) {
  return (
    <div className="rule">
      <small>{label}{suffix ? ` (${suffix})` : ''}</small>
      <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

/**
 * Turn a flat draft map of dotted paths into a nested override object for the API.
 * Array-valued rules (social security lines, gratuity tiers) are rebuilt from the full
 * effective config with only the edited field changed, so unrelated fields like label,
 * wageBase or floor survive the merge instead of being wiped by a partial array replace.
 */
function buildOverride(draft, effective) {
  const out = {};
  for (const [path, value] of Object.entries(draft)) {
    const parts = path.split('.');

    if (parts[0] === 'socialSecurity' && (parts[1] === 'employee' || parts[1] === 'employer')) {
      const side = parts[1], id = parts[2];
      out.socialSecurity = out.socialSecurity ?? {};
      const base = (out.socialSecurity[side] ?? effective.socialSecurity[side] ?? []).map((l) => ({ ...l }));
      const line = base.find((l) => l.id === id);
      if (line) line.rate = value;
      out.socialSecurity[side] = base;
      continue;
    }

    if (parts[0] === 'endOfService' && parts[1] === 'tiers') {
      const idx = Number(parts[2]);
      out.endOfService = out.endOfService ?? {};
      const tiers = (out.endOfService.tiers ?? effective.endOfService.tiers).map((t) => ({ ...t }));
      tiers[idx] = { ...tiers[idx], daysPerYear: value };
      out.endOfService.tiers = tiers;
      continue;
    }

    let node = out;
    for (let i = 0; i < parts.length - 1; i++) { node[parts[i]] = node[parts[i]] ?? {}; node = node[parts[i]]; }
    node[parts.at(-1)] = value;
  }
  return out;
}
