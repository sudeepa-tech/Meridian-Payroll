import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/AppContext.jsx';
import { Icon } from '../components/Icon.jsx';

const SOURCES = [
  { id: 'csv', label: 'CSV file', icon: Icon.Download, desc: 'Upload a .csv export from any system' },
  { id: 'xlsx', label: 'Excel file', icon: Icon.Download, desc: 'Upload a .xlsx workbook (first sheet is used)' },
  { id: 'pdf', label: 'PDF document', icon: Icon.Download, desc: 'Text-based PDFs with tabular data' },
  { id: 'text', label: 'Paste text', icon: Icon.Chat, desc: 'AI-assisted extraction from pasted text' },
  { id: 'gsheet', label: 'Google Sheet', icon: Icon.Sliders, desc: 'Paste a public share link' },
  { id: 'hrms-demo', label: 'Demo HRMS', icon: Icon.Users, desc: 'Simulated — no real vendor connected' },
  { id: 'hrms-generic', label: 'Generic HRMS API', icon: Icon.Users, desc: 'Any REST endpoint returning JSON employees' },
];

export default function Connectors() {
  const { notify, can } = useApp();
  const canImport = can('admin', 'hr_manager');
  const fileRef = useRef(null);
  const [source, setSource] = useState('csv');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [mapping, setMapping] = useState({});
  const [text, setText] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [hrmsBaseUrl, setHrmsBaseUrl] = useState('');
  const [hrmsToken, setHrmsToken] = useState('');
  const [importSummary, setImportSummary] = useState(null);
  const [jobs, setJobs] = useState([]);

  useEffect(() => { api.connectors.jobs().then(setJobs); }, []);

  const handleParsed = (res) => { setResult(res); setMapping(res.suggestedMapping ?? {}); setImportSummary(null); };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setResult(null);
    try {
      const fn = source === 'csv' ? api.connectors.parseCsv : source === 'xlsx' ? api.connectors.parseXlsx : api.connectors.parsePdf;
      handleParsed(await fn(file));
    } catch (err) { notify(err.message); }
    finally { setBusy(false); e.target.value = ''; }
  };

  const runText = async () => { if (!text.trim()) return; setBusy(true); try { handleParsed(await api.connectors.parseText(text)); } catch (e) { notify(e.message); } finally { setBusy(false); } };
  const runSheet = async () => { if (!sheetUrl.trim()) return; setBusy(true); try { handleParsed(await api.connectors.googleSheet(sheetUrl)); } catch (e) { notify(e.message); } finally { setBusy(false); } };
  const runDemoHrms = async () => { setBusy(true); try { handleParsed(await api.connectors.hrmsDemo()); } catch (e) { notify(e.message); } finally { setBusy(false); } };
  const runGenericHrms = async () => { if (!hrmsBaseUrl.trim()) return; setBusy(true); try { handleParsed(await api.connectors.hrmsGeneric(hrmsBaseUrl, hrmsToken)); } catch (e) { notify(e.message); } finally { setBusy(false); } };

  const doImport = async () => {
    if (!result?.rows?.length) return;
    setBusy(true);
    try {
      const res = await api.connectors.import({ rows: result.rows, mapping, sourceType: result.sourceType, sourceName: result.sourceName });
      setImportSummary(res);
      notify(`Imported ${res.created} employee${res.created === 1 ? '' : 's'}${res.skipped.length ? `, ${res.skipped.length} skipped` : ''}`);
      api.connectors.jobs().then(setJobs);
    } catch (e) { notify(e.message); }
    finally { setBusy(false); }
  };

  const selected = SOURCES.find((s) => s.id === source);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Data connectors</h1>
          <p>Pull employee data from spreadsheets, PDFs, Google Sheets, or another HRMS straight into the payroll engine — map columns once, review, and import.</p>
        </div>
      </div>
      {!canImport && <div className="note" style={{ marginBottom: 18 }}>Read-only for your role. HR managers and Administrators can import employee data.</div>}

      <div className="panel">
        <div className="panel-head"><h2>Choose a source</h2></div>
        <div className="row wrap" style={{ gap: 8, marginBottom: 16 }}>
          {SOURCES.map((s) => (
            <button key={s.id} className={`chip ${source === s.id ? 'green' : ''}`} style={{ cursor: 'pointer', border: '1px solid var(--line-2)', padding: '8px 12px' }} onClick={() => { setSource(s.id); setResult(null); }}>
              <s.icon style={{ width: 14, height: 14 }} /> {s.label}
            </button>
          ))}
        </div>
        <p className="faint" style={{ marginBottom: 14 }}>{selected.desc}</p>

        {(source === 'csv' || source === 'xlsx' || source === 'pdf') && (
          <div>
            <input ref={fileRef} type="file" accept={source === 'csv' ? '.csv' : source === 'xlsx' ? '.xlsx,.xls' : '.pdf'} onChange={onFile} disabled={!canImport || busy} />
          </div>
        )}
        {source === 'text' && (
          <div className="list">
            <textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste employee data — e.g. from an email, a chat message, or any unstructured text..." disabled={!canImport} />
            <button className="btn primary" style={{ width: 'fit-content' }} disabled={!canImport || busy} onClick={runText}>Extract with AI</button>
          </div>
        )}
        {source === 'gsheet' && (
          <div className="row">
            <input className="input" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." disabled={!canImport} />
            <button className="btn primary" disabled={!canImport || busy} onClick={runSheet}>Fetch</button>
          </div>
        )}
        {source === 'hrms-demo' && (
          <button className="btn primary" disabled={!canImport || busy} onClick={runDemoHrms}>Fetch from Demo HRMS</button>
        )}
        {source === 'hrms-generic' && (
          <div className="grid cols-2">
            <input className="input" value={hrmsBaseUrl} onChange={(e) => setHrmsBaseUrl(e.target.value)} placeholder="https://your-hrms.example.com/api" disabled={!canImport} />
            <input className="input" value={hrmsToken} onChange={(e) => setHrmsToken(e.target.value)} placeholder="Bearer token (optional)" disabled={!canImport} />
            <button className="btn primary" style={{ width: 'fit-content' }} disabled={!canImport || busy} onClick={runGenericHrms}>Fetch</button>
          </div>
        )}
        {busy && <p className="muted" style={{ marginTop: 12 }}>Working…</p>}
      </div>

      {result && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head"><h2>Preview &amp; map columns</h2><span className="faint">{result.totalRows} row{result.totalRows === 1 ? '' : 's'} found</span></div>

          {result.extraction?.note && <div className="note" style={{ marginBottom: 14 }}>{result.extraction.note}</div>}

          {result.rows.length > 0 && (
            <>
              <div className="rule-grid" style={{ marginBottom: 16 }}>
                {result.targetFields.map((f) => (
                  <div className="rule" key={f.key}>
                    <small>{f.label}{f.required ? ' *' : ''}</small>
                    <select value={mapping[f.key] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))} style={{ border: 0, width: '100%', fontFamily: 'var(--display)', fontSize: 15, background: 'transparent' }}>
                      <option value="">— not mapped —</option>
                      {result.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <table className="table">
                <thead><tr>{result.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {result.rows.slice(0, 6).map((row, i) => (
                    <tr key={i}>{result.headers.map((h) => <td key={h}>{String(row[h] ?? '')}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              {result.totalRows > 6 && <p className="faint" style={{ marginTop: 8 }}>+{result.totalRows - 6} more rows</p>}

              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn primary" disabled={!canImport || busy} onClick={doImport}><Icon.Check style={{ width: 16, height: 16 }} /> Import {result.totalRows} employee{result.totalRows === 1 ? '' : 's'}</button>
              </div>
            </>
          )}

          {importSummary && (
            <div className="panel" style={{ marginTop: 16, background: importSummary.skipped.length ? 'var(--gold-2)' : 'var(--green-2)' }}>
              <div className="t">Imported {importSummary.created} of {result.totalRows}</div>
              {importSummary.skipped.length > 0 && (
                <div className="list" style={{ marginTop: 10 }}>
                  {importSummary.skipped.map((s, i) => <div key={i} className="s">{s.reason} — {JSON.stringify(s.row).slice(0, 80)}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><h2>Recent import jobs</h2></div>
        {jobs.length === 0 && <p className="muted">No imports yet.</p>}
        <table className="table">
          <thead><tr><th>Source</th><th>Target</th><th className="r">Rows</th><th className="r">Imported</th><th>Status</th><th>By</th><th>When</th></tr></thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td>{j.sourceType}{j.sourceName ? <span className="sub">{j.sourceName}</span> : null}</td>
                <td>{j.target}</td>
                <td className="r num">{j.rowCount}</td>
                <td className="r num">{j.importedCount}</td>
                <td><span className={`chip ${j.status === 'success' ? 'green' : j.status === 'partial' ? 'gold' : 'red'}`}>{j.status}</span></td>
                <td className="faint">{j.createdBy}</td>
                <td className="faint">{new Date(j.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
