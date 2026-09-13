import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/AppContext.jsx';
import { Icon } from '../components/Icon.jsx';

const REGION_ORDER = ['North America', 'Middle East'];

export default function Policies() {
  const { countries, notify, can } = useApp();
  const canEdit = can('admin');
  const [fields, setFields] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState([]);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.policies.fields().then(setFields);
    api.policies.list().then(setPolicies);
  };
  useEffect(load, []);

  const toggleScope = (code) => setScope((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));
  const toggleRegion = (region) => {
    const codes = countries.filter((c) => c.region === region).map((c) => c.code);
    const allIn = codes.every((c) => scope.includes(c));
    setScope((s) => (allIn ? s.filter((c) => !codes.includes(c)) : [...new Set([...s, ...codes])]));
  };

  const reset = () => { setName(''); setDescription(''); setScope([]); setValues({}); setShowForm(false); };

  const create = async () => {
    const activeFields = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v !== null && v !== undefined));
    if (!name.trim()) return notify('Give the policy a name');
    if (!scope.length) return notify('Select at least one country');
    if (!Object.keys(activeFields).length) return notify('Set at least one rule value');
    setSaving(true);
    try {
      await api.policies.create({ name, description, scope, fields: activeFields });
      notify('Policy created as a draft');
      reset();
      load();
    } catch (e) { notify(e.message); }
    finally { setSaving(false); }
  };

  const apply = async (id) => {
    try {
      const res = await api.policies.apply(id);
      notify(`Applied to ${res.affected.length} ${res.affected.length === 1 ? 'country' : 'countries'}`);
      load();
    } catch (e) { notify(e.message); }
  };

  const remove = async (id) => { await api.policies.remove(id); notify('Policy deleted'); load(); };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Rules &amp; regulations — policy builder</h1>
          <p>Author one rule change and apply it across any combination of your US and Middle East entities at once, instead of editing each country individually.</p>
        </div>
        {canEdit && <button className="btn primary" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ New policy'}</button>}
      </div>

      {!canEdit && <div className="note" style={{ marginBottom: 18 }}>Read-only for your role. Only an Administrator can create or apply organisation-wide policies.</div>}

      {showForm && canEdit && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head"><h2>New policy</h2></div>
          <div className="grid cols-2">
            <div className="field">
              <label>Policy name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GCC overtime standardization" />
            </div>
            <div className="field">
              <label>Description (optional)</label>
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why this policy exists" />
            </div>
          </div>

          <h3 style={{ marginTop: 18, marginBottom: 8 }}>Applies to</h3>
          {REGION_ORDER.map((region) => {
            const list = countries.filter((c) => c.region === region);
            const allIn = list.every((c) => scope.includes(c.code));
            return (
              <div key={region} style={{ marginBottom: 10 }}>
                <div className="row" style={{ marginBottom: 6 }}>
                  <span className="faint" style={{ fontWeight: 600 }}>{region}</span>
                  <button className="btn sm" onClick={() => toggleRegion(region)}>{allIn ? 'Clear all' : 'Select all'}</button>
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  {list.map((c) => (
                    <button key={c.code} className={`chip ${scope.includes(c.code) ? 'green' : ''}`} style={{ cursor: 'pointer', border: '1px solid var(--line-2)' }} onClick={() => toggleScope(c.code)}>
                      {scope.includes(c.code) ? <Icon.Check style={{ width: 11, height: 11 }} /> : null} {c.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          <h3 style={{ marginTop: 18, marginBottom: 8 }}>Rule values <span className="faint" style={{ fontWeight: 400 }}>— leave blank to not change that field</span></h3>
          <div className="rule-grid">
            {fields.map((f) => (
              <div className="rule" key={f.key}>
                <small>{f.label}</small>
                <input type="number" step={f.step} value={values[f.key] ?? ''} placeholder="—" onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
              </div>
            ))}
          </div>

          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn primary" disabled={saving} onClick={create}><Icon.Check style={{ width: 16, height: 16 }} /> Save as draft</button>
            <button className="btn" onClick={reset}>Clear</button>
          </div>
          <p className="faint" style={{ marginTop: 10 }}>Saving creates a draft only — nothing changes until you apply it below.</p>
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><h2>Policies</h2><span className="faint">{policies.length} total</span></div>
        {policies.length === 0 && <p className="muted">No policies yet. {canEdit ? 'Create one above.' : ''}</p>}
        <div className="list">
          {policies.map((p) => (
            <div className="item" key={p.id}>
              <span className="dot" style={{ background: p.status === 'applied' ? 'var(--green)' : 'var(--gold)' }} />
              <div style={{ width: '100%' }}>
                <div className="row"><span className="t">{p.name}</span><span className={`chip ${p.status === 'applied' ? 'green' : 'gold'}`}>{p.status}</span></div>
                {p.description && <div className="d">{p.description}</div>}
                <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                  {p.scope.map((code) => <span key={code} className="chip">{code}</span>)}
                </div>
                <div className="s" style={{ marginTop: 6 }}>
                  {Object.entries(flatten(p.rules)).map(([k, v]) => `${k} → ${v}`).join(' · ')}
                </div>
                <div className="s">Created by {p.createdBy} · {new Date(p.createdAt).toLocaleString()}{p.appliedAt ? ` · Applied ${new Date(p.appliedAt).toLocaleString()}` : ''}</div>
              </div>
              {canEdit && (
                <div className="row" style={{ flexDirection: 'column', gap: 6 }}>
                  {p.status === 'draft' && <button className="btn sm primary" onClick={() => apply(p.id)}>Apply now</button>}
                  <button className="btn sm danger" onClick={() => remove(p.id)}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function flatten(obj, prefix = '') {
  let out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') out = { ...out, ...flatten(v, key) };
    else out[key] = v;
  }
  return out;
}
