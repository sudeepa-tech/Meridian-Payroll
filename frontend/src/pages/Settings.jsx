import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/AppContext.jsx';
import { Icon } from '../components/Icon.jsx';

export default function Settings() {
  const { settings, updateSettings, currencies, can, notify } = useApp();
  const canEdit = can('admin');
  const [name, setName] = useState('');
  const [audit, setAudit] = useState([]);
  const [rates, setRates] = useState({});
  const [companies, setCompanies] = useState([]);
  const [newCompany, setNewCompany] = useState('');
  const [addingCompany, setAddingCompany] = useState(false);

  useEffect(() => { if (settings) { setName(settings.companyName); setRates(settings.fxRates ?? {}); } }, [settings]);
  useEffect(() => { api.settings.audit().then(setAudit); }, []);
  const loadCompanies = () => api.settings.companies.list().then(setCompanies);
  useEffect(() => { loadCompanies(); }, []);

  if (!settings) return null;

  const selectCompany = async (companyName) => {
    try { await updateSettings({ companyName }); setName(companyName); }
    catch (e) { notify(e.message); }
  };

  const addCompany = async () => {
    if (!newCompany.trim()) return;
    setAddingCompany(true);
    try {
      const c = await api.settings.companies.create(newCompany.trim());
      setNewCompany('');
      await loadCompanies();
      notify(`Added "${c.name}"`);
    } catch (e) { notify(e.message); }
    finally { setAddingCompany(false); }
  };

  const removeCompany = async (id, companyName) => {
    try { await api.settings.companies.remove(id); loadCompanies(); notify(`Removed "${companyName}"`); }
    catch (e) { notify(e.message); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Company profile, exchange rates for consolidation, and the change audit trail.</p>
        </div>
      </div>
      {!canEdit && <div className="note" style={{ marginBottom: 18 }}>Read-only for your role. Only an Administrator can change company settings.</div>}

      <div className="grid cols-2">
        <div className="panel">
          <div className="panel-head"><h2>Companies</h2><span className="faint">{companies.length} on file</span></div>
          <p className="faint" style={{ marginBottom: 12 }}>The selected company appears on payslips, reports, and exports. Switch entities without losing any data — payroll, employees, and compliance rules stay separate per country regardless of which company is active.</p>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Active company</label>
            <select className="input" disabled={!canEdit} value={settings.companyName} onChange={(e) => selectCompany(e.target.value)}>
              {companies.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div className="list">
            {companies.map((c) => (
              <div className="item" key={c.id}>
                <span className="dot" style={{ background: c.name === settings.companyName ? 'var(--green)' : 'var(--ink-3)' }} />
                <div><div className="t">{c.name}</div><div className="s">Added {new Date(c.createdAt).toLocaleDateString()} by {c.createdBy}</div></div>
                {canEdit && companies.length > 1 && <button className="btn sm danger" onClick={() => removeCompany(c.id, c.name)}>Remove</button>}
              </div>
            ))}
          </div>
          {canEdit && (
            <div className="row" style={{ marginTop: 14 }}>
              <input className="input" value={newCompany} onChange={(e) => setNewCompany(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCompany()} placeholder="Add another company, e.g. Acme Middle East FZE" />
              <button className="btn primary" disabled={addingCompany} onClick={addCompany}><Icon.Check style={{ width: 16, height: 16 }} /> Add</button>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Company profile</h2></div>
          <div className="field">
            <label>Legal name (of active company)</label>
            <input className="input" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} onBlur={() => canEdit && name !== settings.companyName && updateSettings({ companyName: name })} />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Reporting currency</label>
            <select className="input" disabled={!canEdit} value={settings.reportingCurrency} onChange={(e) => updateSettings({ reportingCurrency: e.target.value })}>
              {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>AI provider</label>
            <input className="input" disabled value={settings.aiProvider === 'anthropic' ? 'Claude (ANTHROPIC_API_KEY set)' : 'Local analytical mode — set ANTHROPIC_API_KEY on the server to enable Claude'} />
          </div>
        </div>

        <div className="panel span-2">
          <div className="panel-head"><h2>Exchange rates (per USD)</h2></div>
          <div className="rule-grid">
            {currencies.filter((c) => c.code !== 'USD').map((c) => (
              <div className="rule" key={c.code}>
                <small>{c.code} — {c.name}</small>
                <input type="number" step="0.0001" value={rates[c.code] ?? c.rateToUsd}
                  onChange={(e) => setRates((r) => ({ ...r, [c.code]: Number(e.target.value) }))}
                  onBlur={() => updateSettings({ fxRates: { USD: 1, ...rates } })} />
              </div>
            ))}
          </div>
        </div>

        <div className="panel span-2">
          <div className="panel-head"><h2>Audit trail</h2></div>
          <table className="table">
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="faint">{new Date(a.at).toLocaleString()}</td>
                  <td>{a.actor}</td>
                  <td><span className="chip">{a.action}</span></td>
                  <td className="faint">{Object.entries(a).filter(([k]) => !['id', 'at', 'actor', 'action'].includes(k)).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
