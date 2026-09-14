import React, { useEffect, useState } from 'react';
import { api, fmtMoney } from '../lib/api.js';
import { useApp } from '../lib/AppContext.jsx';
import { Icon } from '../components/Icon.jsx';

function Drawer({ id, onClose }) {
  const { notify, can } = useApp();
  const [data, setData] = useState(null);
  const [emailing, setEmailing] = useState(false);
  const [emailResult, setEmailResult] = useState(null);
  const canSend = can('admin', 'payroll_admin', 'hr_manager');
  const period = '2026-09';
  useEffect(() => { api.employees.get(id).then(setData); setEmailResult(null); }, [id]);
  if (!data) return null;
  const p = data.preview;
  const c = p.currency;
  const sendPayslip = async () => {
    setEmailing(true);
    try {
      const res = await api.payroll.emailPayslip(id, period);
      setEmailResult(res);
      notify(res.status === 'sent' ? `Payslip emailed to ${res.toEmail}` : res.status === 'dry-run' ? 'SMTP not configured — email composed but not sent (dry-run)' : `Failed: ${res.detail}`);
    } catch (e) { notify(e.message); }
    finally { setEmailing(false); }
  };
  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <div className="drawer">
        <div className="row" style={{ marginBottom: 4 }}>
          <span className="chip">{data.id}</span>
          <span className="spacer" />
          <button className="btn sm" onClick={onClose}><Icon.Close style={{ width: 14, height: 14 }} /></button>
        </div>
        <h1 style={{ marginTop: 10 }}>{data.name}</h1>
        <p className="muted">{data.title} · {data.department} · {data.country}</p>

        <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
          <span className="chip">{data.employmentType}</span>
          <span className="chip">Hired {data.hireDate}</span>
          <span className="chip">Nationality {data.nationality}</span>
          {!data.iban && <span className="chip red"><Icon.Alert style={{ width: 12, height: 12 }} /> No IBAN on file</span>}
        </div>

        <h2 style={{ marginTop: 22, marginBottom: 10 }}>This period's payslip</h2>
        <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
          <a className="btn sm" href={api.payroll.payslipUrl(id, period)} target="_blank" rel="noreferrer"><Icon.Download style={{ width: 14, height: 14 }} /> Download PDF</a>
          {canSend && <button className="btn sm primary" onClick={sendPayslip} disabled={emailing}>{emailing ? 'Sending…' : 'Email payslip'}</button>}
        </div>
        {emailResult && (
          <div className={`chip ${emailResult.status === 'sent' ? 'green' : emailResult.status === 'dry-run' ? 'gold' : 'red'}`} style={{ marginBottom: 10, display: 'inline-block' }}>
            {emailResult.status === 'sent' ? `Sent to ${emailResult.toEmail}` : emailResult.status === 'dry-run' ? 'Dry-run — SMTP not configured' : `Failed: ${emailResult.detail}`}
          </div>
        )}
        <div className="panel" style={{ padding: 14 }}>
          <div className="payslip-line"><span>Basic pay</span><span className="num">{fmtMoney(p.earnings.basic, c, p.decimals)}</span></div>
          {p.earnings.allowances > 0 && <div className="payslip-line"><span>Allowances</span><span className="num">{fmtMoney(p.earnings.allowances, c, p.decimals)}</span></div>}
          {p.earnings.overtime > 0 && <div className="payslip-line"><span>Overtime ({p.earnings.overtimeHours}h)</span><span className="num">{fmtMoney(p.earnings.overtime, c, p.decimals)}</span></div>}
          {p.earnings.bonus > 0 && <div className="payslip-line"><span>Bonus</span><span className="num">{fmtMoney(p.earnings.bonus, c, p.decimals)}</span></div>}
          <div className="payslip-line"><span>Gross pay</span><span className="num">{fmtMoney(p.earnings.gross, c, p.decimals)}</span></div>
          {p.deductions.employeeContributions.map((l) => (
            <div className="payslip-line" key={l.id}><span>− {l.label}</span><span className="num">{fmtMoney(l.amount, c, p.decimals)}</span></div>
          ))}
          {p.deductions.incomeTax > 0 && <div className="payslip-line"><span>− Federal income tax</span><span className="num">{fmtMoney(p.deductions.incomeTax, c, p.decimals)}</span></div>}
          {p.deductions.stateTax > 0 && <div className="payslip-line"><span>− State tax ({data.state})</span><span className="num">{fmtMoney(p.deductions.stateTax, c, p.decimals)}</span></div>}
          <div className="payslip-line total"><span>Net pay</span><span className="num">{fmtMoney(p.net, c, p.decimals)}</span></div>
        </div>

        <h2 style={{ marginTop: 22, marginBottom: 10 }}>Employer cost</h2>
        <div className="panel" style={{ padding: 14 }}>
          {p.employer.contributions.map((l) => (
            <div className="payslip-line" key={l.id}><span>{l.label}</span><span className="num">{fmtMoney(l.amount, c, p.decimals)}</span></div>
          ))}
          {p.employer.endOfServiceAccrual > 0 && <div className="payslip-line"><span>End-of-service accrual</span><span className="num">{fmtMoney(p.employer.endOfServiceAccrual, c, p.decimals)}</span></div>}
          <div className="payslip-line total"><span>Total employer cost</span><span className="num">{fmtMoney(p.employer.totalCost, c, p.decimals)}</span></div>
        </div>

        {data.endOfService?.enabled !== false && data.endOfService?.accruedTotal > 0 && (
          <>
            <h2 style={{ marginTop: 22, marginBottom: 10 }}>End-of-service liability</h2>
            <div className="panel" style={{ padding: 14 }}>
              <div className="payslip-line"><span>Accrued to date ({data.endOfService.years} yrs)</span><span className="num">{fmtMoney(data.endOfService.accruedTotal, c, p.decimals)}</span></div>
              <div className="payslip-line"><span>Eligible if leaving today</span><span>{data.endOfService.eligible ? 'Yes' : 'Not yet'}</span></div>
            </div>
          </>
        )}

        {p.warnings.length > 0 && (
          <>
            <h2 style={{ marginTop: 22, marginBottom: 10 }}>Warnings</h2>
            <div className="list">
              {p.warnings.map((w, i) => (
                <div className="item" key={i}><span className="dot" style={{ background: 'var(--red)' }} /><div><div className="t">{w.code.replace(/_/g, ' ')}</div><div className="d">{w.message}</div></div></div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function Employees() {
  const { country, activeCountry, countries } = useApp();
  const ccyFor = (code) => countries.find((c) => c.code === code)?.currency?.code ?? 'USD';
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('country');
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.employees.list(scope === 'country' ? { country } : {}).then((l) => { setList(l); setLoading(false); });
  };
  useEffect(load, [country, scope]);

  const filtered = list.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()) || e.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Employees</h1>
          <p>{scope === 'country' ? `Showing ${activeCountry?.name ?? ''}` : 'Showing all entities'} · {filtered.length} people</p>
        </div>
        <div className="row">
          <div className="seg" style={{ display: 'flex', border: '1px solid var(--line-2)', borderRadius: 999, padding: 3 }}>
            <button className={scope === 'country' ? 'on' : ''} style={segBtn(scope === 'country')} onClick={() => setScope('country')}>This country</button>
            <button className={scope === 'all' ? 'on' : ''} style={segBtn(scope === 'all')} onClick={() => setScope('all')}>All entities</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="row" style={{ marginBottom: 14 }}>
          <div className="field" style={{ maxWidth: 320 }}>
            <input className="input" placeholder="Search name or title…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <table className="table">
          <thead>
            <tr><th>Employee</th><th>Role</th>{scope === 'all' && <th>Country</th>}<th className="r">Basic salary</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="muted">Loading…</td></tr>}
            {!loading && filtered.map((e) => (
              <tr key={e.id} className="click" onClick={() => setOpenId(e.id)}>
                <td><b>{e.name}</b><span className="sub">{e.id}</span></td>
                <td>{e.title}<span className="sub">{e.department}</span></td>
                {scope === 'all' && <td>{e.country}</td>}
                <td className="r num">{fmtMoney(e.basicSalary, ccyFor(e.country))}</td>
                <td><span className={`chip ${e.status === 'active' ? 'green' : 'red'}`}>{e.status}</span></td>
                <td className="r faint">View →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId && <Drawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function segBtn(on) {
  return { border: 0, background: on ? 'var(--ink)' : 'transparent', color: on ? '#fff' : 'var(--ink-2)', padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontWeight: 500 };
}
