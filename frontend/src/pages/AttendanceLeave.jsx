import React, { useEffect, useState } from 'react';
import { api, fmtNum } from '../lib/api.js';
import { useApp } from '../lib/AppContext.jsx';
import { Icon } from '../components/Icon.jsx';

export default function AttendanceLeave() {
  const { country, activeCountry, notify, can } = useApp();
  const canDecide = can('hr_manager', 'admin');
  const [overview, setOverview] = useState(null);
  const [rows, setRows] = useState([]);
  const [requests, setRequests] = useState([]);
  const [tab, setTab] = useState('attendance');
  const [statusFilter, setStatusFilter] = useState('pending');

  const load = () => {
    api.attendance.overview().then(setOverview);
    api.attendance.list({ country }).then(setRows);
    api.leave.requests({ country, ...(statusFilter ? { status: statusFilter } : {}) }).then(setRequests);
  };
  useEffect(load, [country, statusFilter]);

  const decide = async (id, decision) => {
    await api.leave.decide(id, decision);
    notify(`Leave request ${decision}`);
    load();
  };

  const c = activeCountry;
  const overtimeLaw = c?.overtime;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Attendance &amp; leave</h1>
          <p>Timesheet-derived overtime feeds directly into payroll, using {c?.name}'s rounding rule and daily/weekly caps.</p>
        </div>
        <div className="seg" style={{ display: 'flex', border: '1px solid var(--line-2)', borderRadius: 999, padding: 3 }}>
          <button style={segBtn(tab === 'attendance')} onClick={() => setTab('attendance')}>Attendance</button>
          <button style={segBtn(tab === 'leave')} onClick={() => setTab('leave')}>Leave requests</button>
        </div>
      </div>

      {overview && (
        <div className="grid cols-4">
          <div className="panel stat-card"><small>Total overtime, Sep 2026</small><b>{fmtNum(overview.totals.overtimeHours, 1)}h</b><i>across all entities</i></div>
          <div className="panel stat-card"><small>Late arrivals</small><b>{overview.totals.lateCount}</b><i>punch-in events</i></div>
          <div className="panel stat-card"><small>Absences</small><b>{overview.totals.absentDays}</b><i>unplanned days</i></div>
          <div className="panel stat-card" style={{ background: overview.totals.exceptions > 0 ? 'var(--red-2)' : 'var(--green-2)', borderColor: 'transparent' }}>
            <small>Policy exceptions</small><b>{overview.totals.exceptions}</b><i>daily overtime cap breaches</i>
          </div>
        </div>
      )}

      {tab === 'attendance' ? (
        <div className="grid cols-2" style={{ marginTop: 16 }}>
          <div className="panel">
            <div className="panel-head"><h2>Overtime rule — {c?.name}</h2></div>
            {overtimeLaw && (
              <div className="list">
                <div className="item"><span className="dot" style={{ background: 'var(--blue)' }} /><div><div className="t">Basis &amp; multiplier</div><div className="d">{overtimeLaw.basis === 'daily' ? `Beyond ${overtimeLaw.threshold}h/day` : `Beyond ${overtimeLaw.threshold}h/week`} paid at {overtimeLaw.multiplier}×{overtimeLaw.nightMultiplier ? `, ${overtimeLaw.nightMultiplier}× at night` : ''}</div></div></div>
                <div className="item"><span className="dot" style={{ background: 'var(--gold)' }} /><div><div className="t">Rounding</div><div className="d">Raw minutes rounded {overtimeLaw.rounding?.rule ?? 'nearest'} to the nearest {overtimeLaw.rounding?.increment ?? 15} minutes</div></div></div>
                {overtimeLaw.dailyCap && <div className="item"><span className="dot" style={{ background: 'var(--red)' }} /><div><div className="t">Daily cap</div><div className="d">{overtimeLaw.dailyCap}h/day statutory maximum — excess flagged for review</div></div></div>}
                {overtimeLaw.requiresPriorApproval && <div className="item"><span className="dot" style={{ background: 'var(--ink-3)' }} /><div><div className="t">Prior approval</div><div className="d">Overtime requires manager sign-off before it can be worked</div></div></div>}
              </div>
            )}
          </div>
          <div className="panel">
            <div className="panel-head"><h2>Overtime by entity</h2></div>
            <div className="list">
              {overview?.byCountry.map((b) => (
                <div className="item" key={b.country}>
                  <span className="dot" style={{ background: 'var(--blue)' }} />
                  <div style={{ width: '100%' }}>
                    <div className="row"><span className="t">{b.country}</span><span className="faint">{b.headcount} employees</span></div>
                    <div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${Math.min(100, (b.overtimeHours / 150) * 100)}%`, background: 'var(--blue)' }} /></div>
                  </div>
                  <span className="chip">{fmtNum(b.overtimeHours, 1)}h</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel span-2">
            <div className="panel-head"><h2>Timesheet summary — {c?.name}</h2><span className="faint">September 2026</span></div>
            <table className="table">
              <thead><tr><th>Employee</th><th>Department</th><th className="r">Overtime</th><th className="r">Late</th><th className="r">Absent</th><th className="r">Exceptions</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employeeId}>
                    <td><b>{r.name}</b><span className="sub">{r.employeeId}</span></td>
                    <td>{r.department}</td>
                    <td className="r num">{fmtNum(r.summary.overtimeHours, 1)}h</td>
                    <td className="r num">{r.summary.lateCount}</td>
                    <td className="r num">{r.summary.absentDays}</td>
                    <td className="r">{r.summary.exceptions.length > 0 ? <span className="chip red">{r.summary.exceptions.length}</span> : <span className="chip green">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <h2>Leave requests — {c?.name}</h2>
            <select className="input" style={{ width: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="">All</option>
            </select>
          </div>
          <div className="list">
            {requests.length === 0 && <p className="muted">No requests match this filter.</p>}
            {requests.map((r) => (
              <div className="item" key={r.id}>
                <span className="dot" style={{ background: r.type === 'sick' ? 'var(--red)' : r.type === 'unpaid' ? 'var(--gold)' : 'var(--green)' }} />
                <div>
                  <div className="t">{r.employeeName} · {r.type} leave</div>
                  <div className="d">{r.startDate} → {r.endDate} · {r.days} day{r.days > 1 ? 's' : ''} · {r.reason}</div>
                  <div className="s">Requested {new Date(r.requestedAt).toLocaleDateString()}</div>
                </div>
                {r.status === 'pending' ? (
                  canDecide ? (
                    <div className="row">
                      <button className="btn sm primary" onClick={() => decide(r.id, 'approved')}><Icon.Check style={{ width: 14, height: 14 }} /></button>
                      <button className="btn sm danger" onClick={() => decide(r.id, 'rejected')}><Icon.Close style={{ width: 14, height: 14 }} /></button>
                    </div>
                  ) : <span className="chip gold">pending — HR only</span>
                ) : <span className={`chip ${r.status === 'approved' ? 'green' : 'red'}`}>{r.status}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function segBtn(on) {
  return { border: 0, background: on ? 'var(--ink)' : 'transparent', color: on ? '#fff' : 'var(--ink-2)', padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontWeight: 500 };
}
