import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/AppContext.jsx';

export default function Settings() {
  const { settings, updateSettings, currencies, can } = useApp();
  const canEdit = can('admin');
  const [name, setName] = useState('');
  const [audit, setAudit] = useState([]);
  const [rates, setRates] = useState({});

  useEffect(() => { if (settings) { setName(settings.companyName); setRates(settings.fxRates ?? {}); } }, [settings]);
  useEffect(() => { api.settings.audit().then(setAudit); }, []);

  if (!settings) return null;

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
          <div className="panel-head"><h2>Company</h2></div>
          <div className="field">
            <label>Legal name</label>
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

        <div className="panel">
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
