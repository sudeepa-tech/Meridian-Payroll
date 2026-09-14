import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/AppContext.jsx';
import { Icon } from '../components/Icon.jsx';

const RULE_TYPE_LABEL = { earning: 'Earning', deduction: 'Deduction', employer_contribution: 'Employer contribution' };
const METHOD_LABEL = { flat: 'Flat amount', percent_of_basic: '% of basic salary', percent_of_gross: '% of gross salary', formula: 'Custom formula', tiered: 'Tiered brackets' };

const EMPTY_FORM = {
  name: '', description: '', ruleType: 'earning', calcMethod: 'flat',
  amount: '', rate: '', expression: '', tiers: [{ upTo: '', rate: '' }],
  federalTaxable: true, preTax: false, ficaExempt: false,
  countries: [], departments: [],
  effectiveFrom: new Date().toISOString().slice(0, 10), status: 'draft',
};

export default function PayRules() {
  const { countries, notify, can, user } = useApp();
  const canPropose = can('admin', 'payroll_admin');
  const canReview = can('admin');
  const [rules, setRules] = useState([]);
  const [variables, setVariables] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importSource, setImportSource] = useState('csv');
  const [importResult, setImportResult] = useState(null);
  const [importMapping, setImportMapping] = useState({});
  const [importBusy, setImportBusy] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [importSummary, setImportSummary] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reviewNoteFor, setReviewNoteFor] = useState(null);
  const [reviewNote, setReviewNote] = useState('');

  const load = () => { api.payRules.list().then(setRules); api.payRules.variables().then(setVariables); };
  useEffect(load, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const reset = () => { setForm(EMPTY_FORM); setTestResult(null); setShowForm(false); };

  const buildConfig = () => {
    if (form.calcMethod === 'flat') return { amount: Number(form.amount) || 0 };
    if (form.calcMethod === 'percent_of_basic' || form.calcMethod === 'percent_of_gross') return { rate: Number(form.rate) || 0 };
    if (form.calcMethod === 'formula') return { expression: form.expression };
    if (form.calcMethod === 'tiered') return { base: 'grossSalary', tiers: form.tiers.map((t) => ({ upTo: t.upTo === '' ? null : Number(t.upTo), rate: Number(t.rate) || 0 })) };
    return {};
  };

  const handleParsed = (res) => { setImportResult(res); setImportMapping(res.suggestedMapping ?? {}); setImportSummary(null); };
  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportBusy(true); setImportResult(null);
    try {
      const fn = importSource === 'csv' ? api.connectors.payRules.parseCsv
        : importSource === 'xlsx' ? api.connectors.payRules.parseXlsx
        : importSource === 'image' ? api.connectors.payRules.parseImage
        : api.connectors.payRules.parsePdf;
      handleParsed(await fn(file));
    } catch (err) { notify(err.message); }
    finally { setImportBusy(false); e.target.value = ''; }
  };
  const runSheetImport = async () => {
    if (!sheetUrl.trim()) return;
    setImportBusy(true);
    try { handleParsed(await api.connectors.payRules.googleSheet(sheetUrl)); }
    catch (err) { notify(err.message); }
    finally { setImportBusy(false); }
  };
  const doRuleImport = async () => {
    if (!importResult?.rows?.length) return;
    setImportBusy(true);
    try {
      const res = await api.connectors.payRules.import({ rows: importResult.rows, mapping: importMapping, sourceType: importResult.sourceType, sourceName: importResult.sourceName });
      setImportSummary(res);
      notify(`Imported ${res.created} rule${res.created === 1 ? '' : 's'} as draft${res.skipped.length ? `, ${res.skipped.length} skipped` : ''}`);
      load();
    } catch (err) { notify(err.message); }
    finally { setImportBusy(false); }
  };

  const testRule = async () => {
    const rule = { name: form.name || 'Preview', ruleType: form.ruleType, calcMethod: form.calcMethod, config: buildConfig(), scope: { countries: form.countries.length ? form.countries : undefined }, effectiveFrom: form.effectiveFrom };
    try { const res = await api.payRules.preview({ rule, country: form.countries[0] }); setTestResult(res.results); }
    catch (e) { notify(e.message); }
  };

  const save = async () => {
    if (!form.name.trim()) return notify('Give the rule a name');
    setSaving(true);
    try {
      await api.payRules.create({
        name: form.name, description: form.description, ruleType: form.ruleType, calcMethod: form.calcMethod,
        config: buildConfig(),
        taxability: { federalTaxable: form.federalTaxable, preTax: form.preTax, ficaExempt: form.ficaExempt },
        scope: { countries: form.countries.length ? form.countries : undefined, departments: form.departments.length ? form.departments : undefined },
        effectiveFrom: form.effectiveFrom,
      });
      notify('Rule saved as draft');
      reset(); load();
    } catch (e) { notify(e.message); }
    finally { setSaving(false); }
  };

  const submitForReview = async (id) => {
    try { await api.payRules.submitForReview(id); notify('Submitted for review'); load(); }
    catch (e) { notify(e.message); }
  };
  const review = async (id, decision) => {
    try {
      await api.payRules.review(id, decision, reviewNote || undefined);
      notify(decision === 'approved' ? 'Approved' : 'Rejected');
      setReviewNoteFor(null); setReviewNote('');
      load();
    } catch (e) { notify(e.message); }
  };
  const toggleStatus = async (rule) => {
    try { rule.status === 'active' ? await api.payRules.deactivate(rule.id) : await api.payRules.activate(rule.id); notify(`Rule ${rule.status === 'active' ? 'deactivated' : 'activated'}`); load(); }
    catch (e) { notify(e.message); }
  };
  const remove = async (id) => { try { await api.payRules.remove(id); notify('Rule deleted'); load(); } catch (e) { notify(e.message); } };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Pay rules configuration</h1>
          <p>Create custom earnings, deductions, and employer contributions — flat, percentage, formula, or tiered — scoped to any country, department, or employment type. Applied automatically on every payroll run.</p>
        </div>
        {canPropose && <div className="row"><button className="btn" onClick={() => setShowImport((s) => !s)}>{showImport ? 'Cancel import' : 'Import rules'}</button><button className="btn primary" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ New pay rule'}</button></div>}
      </div>
      {!canPropose && <div className="note" style={{ marginBottom: 18 }}>Read-only for your role. Payroll admins and Administrators can create or edit pay rules.</div>}

      {showImport && canPropose && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head"><h2>Import pay rules</h2></div>
          <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
            {['csv', 'xlsx', 'pdf', 'image', 'gsheet'].map((s) => (
              <button key={s} className={`chip ${importSource === s ? 'green' : ''}`} style={{ cursor: 'pointer', border: '1px solid var(--line-2)', padding: '8px 12px' }} onClick={() => { setImportSource(s); setImportResult(null); }}>
                {s === 'csv' ? 'CSV file' : s === 'xlsx' ? 'Excel file' : s === 'pdf' ? 'PDF document' : s === 'image' ? 'Image (photo/screenshot)' : 'Google Sheet'}
              </button>
            ))}
          </div>
          {['csv', 'xlsx', 'pdf'].includes(importSource) && <input type="file" accept={importSource === 'csv' ? '.csv' : importSource === 'xlsx' ? '.xlsx,.xls' : '.pdf'} onChange={onImportFile} disabled={importBusy} />}
          {importSource === 'image' && <input type="file" accept="image/*" onChange={onImportFile} disabled={importBusy} />}
          {importSource === 'gsheet' && (
            <div className="row">
              <input className="input" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
              <button className="btn primary" disabled={importBusy} onClick={runSheetImport}>Fetch</button>
            </div>
          )}
          {importSource === 'image' && <p className="faint" style={{ marginTop: 8 }}>Uses Claude vision to read rule tables from a photo or screenshot — requires ANTHROPIC_API_KEY on the server.</p>}
          {importBusy && <p className="muted" style={{ marginTop: 10 }}>Working…</p>}

          {importResult && (
            <div style={{ marginTop: 16 }}>
              {importResult.extraction?.note && <div className="note" style={{ marginBottom: 12 }}>{importResult.extraction.note}</div>}
              {importResult.rows.length > 0 && (
                <>
                  <div className="rule-grid" style={{ marginBottom: 14 }}>
                    {importResult.targetFields.map((f) => (
                      <div className="rule" key={f.key}>
                        <small>{f.label}{f.required ? ' *' : ''}</small>
                        <select value={importMapping[f.key] ?? ''} onChange={(e) => setImportMapping((m) => ({ ...m, [f.key]: e.target.value }))} style={{ border: 0, width: '100%', fontFamily: 'var(--display)', fontSize: 14, background: 'transparent' }}>
                          <option value="">— not mapped —</option>
                          {importResult.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <table className="table">
                    <thead><tr>{importResult.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>{importResult.rows.slice(0, 6).map((row, i) => <tr key={i}>{importResult.headers.map((h) => <td key={h}>{String(row[h] ?? '')}</td>)}</tr>)}</tbody>
                  </table>
                  <div className="row" style={{ marginTop: 14 }}>
                    <button className="btn primary" disabled={importBusy} onClick={doRuleImport}><Icon.Check style={{ width: 16, height: 16 }} /> Import {importResult.totalRows} rule{importResult.totalRows === 1 ? '' : 's'} as draft</button>
                  </div>
                </>
              )}
              {importSummary && (
                <div className="panel" style={{ marginTop: 14, background: importSummary.skipped.length ? 'var(--gold-2)' : 'var(--green-2)' }}>
                  <div className="t">Imported {importSummary.created} of {importResult.totalRows} — new rules are saved as drafts, activate them below to apply.</div>
                  {importSummary.skipped.map((s, i) => <div key={i} className="s">{s.reason}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showForm && canPropose && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head"><h2>New pay rule</h2></div>
          <div className="grid cols-2">
            <div className="field"><label>Rule name</label><input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Wellness Stipend, 401(k) Match" /></div>
            <div className="field"><label>Description (optional)</label><input className="input" value={form.description} onChange={(e) => set({ description: e.target.value })} /></div>
          </div>

          <div className="grid cols-3" style={{ marginTop: 14 }}>
            <div className="field">
              <label>Type</label>
              <select className="input" value={form.ruleType} onChange={(e) => set({ ruleType: e.target.value })}>
                {Object.entries(RULE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Calculation method</label>
              <select className="input" value={form.calcMethod} onChange={(e) => set({ calcMethod: e.target.value })}>
                {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field"><label>Effective from</label><input className="input" type="date" value={form.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} /></div>
          </div>

          <div style={{ marginTop: 14 }}>
            {form.calcMethod === 'flat' && (
              <div className="rule" style={{ maxWidth: 240 }}><small>Amount per period</small><input type="number" value={form.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="e.g. 50" /></div>
            )}
            {(form.calcMethod === 'percent_of_basic' || form.calcMethod === 'percent_of_gross') && (
              <div className="rule" style={{ maxWidth: 240 }}><small>Rate (%)</small><input type="number" step="0.1" value={form.rate} onChange={(e) => set({ rate: e.target.value })} placeholder="e.g. 3" /></div>
            )}
            {form.calcMethod === 'formula' && (
              <div>
                <div className="field"><label>Formula</label><input className="input" value={form.expression} onChange={(e) => set({ expression: e.target.value })} placeholder="e.g. {basicSalary} * 0.02 + {overtimeHours} * 5" /></div>
                <p className="faint" style={{ marginTop: 6 }}>Variables: {variables.map((v) => `{${v.key}}`).join(', ')}</p>
              </div>
            )}
            {form.calcMethod === 'tiered' && (
              <div className="list">
                {form.tiers.map((t, i) => (
                  <div className="row" key={i}>
                    <div className="rule" style={{ width: 160 }}><small>Up to (gross)</small><input type="number" value={t.upTo} onChange={(e) => { const tiers = [...form.tiers]; tiers[i] = { ...t, upTo: e.target.value }; set({ tiers }); }} placeholder="blank = no limit" /></div>
                    <div className="rule" style={{ width: 120 }}><small>Rate (%)</small><input type="number" step="0.1" value={t.rate} onChange={(e) => { const tiers = [...form.tiers]; tiers[i] = { ...t, rate: e.target.value }; set({ tiers }); }} /></div>
                    {form.tiers.length > 1 && <button className="btn sm" onClick={() => set({ tiers: form.tiers.filter((_, j) => j !== i) })}>Remove</button>}
                  </div>
                ))}
                <button className="btn sm" onClick={() => set({ tiers: [...form.tiers, { upTo: '', rate: '' }] })}>+ Add tier</button>
              </div>
            )}
          </div>

          {form.ruleType !== 'employer_contribution' && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>Tax treatment (USA)</h3>
              <div className="row wrap" style={{ gap: 16 }}>
                <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={form.federalTaxable} onChange={(e) => set({ federalTaxable: e.target.checked })} /> Federal taxable</label>
                <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={form.preTax} onChange={(e) => set({ preTax: e.target.checked })} /> Pre-tax (reduces taxable wages)</label>
                <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={form.ficaExempt} onChange={(e) => set({ ficaExempt: e.target.checked })} /> FICA-exempt</label>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Applies to <span className="faint" style={{ fontWeight: 400 }}>— leave blank for all countries</span></h3>
            <div className="row wrap" style={{ gap: 8 }}>
              {countries.map((c) => (
                <button key={c.code} className={`chip ${form.countries.includes(c.code) ? 'green' : ''}`} style={{ cursor: 'pointer', border: '1px solid var(--line-2)' }}
                  onClick={() => set({ countries: form.countries.includes(c.code) ? form.countries.filter((x) => x !== c.code) : [...form.countries, c.code] })}>
                  {form.countries.includes(c.code) ? <Icon.Check style={{ width: 11, height: 11 }} /> : null} {c.name}
                </button>
              ))}
            </div>
          </div>

          {testResult && (
            <div className="panel" style={{ marginTop: 16, background: 'var(--paper)' }}>
              <div className="panel-head"><h2>Test result</h2></div>
              <table className="table">
                <thead><tr><th>Employee</th><th>Country</th><th className="r">Basic salary</th><th className="r">Rule amount</th><th>Applies</th></tr></thead>
                <tbody>{testResult.map((r) => (
                  <tr key={r.employeeId}><td>{r.name}</td><td>{r.country}</td><td className="r num">{r.basicSalary.toLocaleString()}</td><td className="r num">{r.ruleAmount}</td><td>{r.applies ? <span className="chip green">yes</span> : <span className="chip">no</span>}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}

          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn" onClick={testRule}>Test against sample employees</button>
            <span className="spacer" />
            <button className="btn primary" disabled={saving} onClick={save}><Icon.Check style={{ width: 16, height: 16 }} /> Save as draft</button>
          </div>
          <p className="faint" style={{ marginTop: 10 }}>Saving creates a draft only. It then needs to be submitted for review, and approved by a different Administrator, before it can be activated.</p>
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><h2>Pay rules</h2><span className="faint">{rules.length} total</span></div>
        {rules.length === 0 && <p className="muted">No custom pay rules yet.</p>}
        <div className="list">
          {rules.map((r) => {
            const statusColor = { draft: 'gold', pending_review: 'blue', approved: 'green', rejected: 'red', active: 'green', inactive: '' }[r.status];
            const dotColors = { gold: 'var(--gold)', blue: 'var(--blue)', green: 'var(--green)', red: 'var(--red)', '': 'var(--ink-3)' };
            const isOwnProposal = r.proposedBy === user?.username;
            return (
              <div className="item" key={r.id}>
                <span className="dot" style={{ background: dotColors[statusColor] }} />
                <div style={{ width: '100%' }}>
                  <div className="row">
                    <span className="t">{r.name}</span>
                    <span className="chip">{RULE_TYPE_LABEL[r.ruleType]}</span>
                    <span className="chip">{METHOD_LABEL[r.calcMethod]}</span>
                    <span className={`chip ${statusColor}`}>{r.status.replace('_', ' ')}</span>
                  </div>
                  {r.description && <div className="d">{r.description}</div>}
                  <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                    {(r.scope?.countries ?? ['All countries']).map((c) => <span key={c} className="chip">{c}</span>)}
                  </div>
                  <div className="s" style={{ marginTop: 6 }}>Effective from {r.effectiveFrom}{r.effectiveTo ? ` to ${r.effectiveTo}` : ''} · Proposed by {r.proposedBy}</div>
                  {r.reviewedBy && <div className="s">{r.status === 'rejected' ? 'Rejected' : 'Reviewed'} by {r.reviewedBy} · {new Date(r.reviewedAt).toLocaleString()}{r.reviewNote ? ` — "${r.reviewNote}"` : ''}</div>}
                  {reviewNoteFor === r.id && (
                    <div className="row" style={{ marginTop: 8, gap: 6 }}>
                      <input className="input" style={{ fontSize: 13 }} placeholder="Review note (optional)" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
                      <button className="btn sm primary" onClick={() => review(r.id, 'approved')}>Approve</button>
                      <button className="btn sm danger" onClick={() => review(r.id, 'rejected')}>Reject</button>
                      <button className="btn sm" onClick={() => { setReviewNoteFor(null); setReviewNote(''); }}>Cancel</button>
                    </div>
                  )}
                </div>
                <div className="row" style={{ flexDirection: 'column', gap: 6 }}>
                  {r.status === 'draft' && canPropose && <button className="btn sm primary" onClick={() => submitForReview(r.id)}>Submit for review</button>}
                  {r.status === 'pending_review' && canReview && !isOwnProposal && reviewNoteFor !== r.id && <button className="btn sm primary" onClick={() => setReviewNoteFor(r.id)}>Review</button>}
                  {r.status === 'pending_review' && isOwnProposal && <span className="faint" style={{ fontSize: 12, maxWidth: 140, textAlign: 'right' }}>Awaiting a different Administrator's review</span>}
                  {r.status === 'approved' && canPropose && <button className="btn sm primary" onClick={() => toggleStatus(r)}>Activate</button>}
                  {r.status === 'inactive' && canPropose && <button className="btn sm" onClick={() => toggleStatus(r)}>Reactivate</button>}
                  {r.status === 'active' && canPropose && <button className="btn sm" onClick={() => toggleStatus(r)}>Deactivate</button>}
                  {canReview && <button className="btn sm danger" onClick={() => remove(r.id)}>Delete</button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
