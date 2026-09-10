import React from 'react';
import { Icon } from './Icon.jsx';
import { useApp } from '../lib/AppContext.jsx';

const NAV = [
  { id: 'dashboard', label: 'Overview', icon: Icon.Grid },
  { id: 'employees', label: 'Employees', icon: Icon.Users },
  { id: 'attendance', label: 'Attendance & leave', icon: Icon.Clock },
  { id: 'payroll', label: 'Run payroll', icon: Icon.Play },
  { id: 'compliance', label: 'Rules & compliance', icon: Icon.Shield },
  { id: 'reports', label: 'Reports', icon: Icon.BarChart },
  { id: 'assistant', label: 'AI assistant', icon: Icon.Chat },
  { id: 'settings', label: 'Settings', icon: Icon.Gear },
];

const ROLE_LABEL = { admin: 'Administrator', payroll_admin: 'Payroll admin', hr_manager: 'HR manager', viewer: 'Viewer' };

export default function Rail({ page, setPage }) {
  const { user, logout } = useApp();
  return (
    <nav className="rail">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div>
          <strong>Meridian</strong>
          <span>Payroll, worldwide</span>
        </div>
      </div>
      {NAV.map((n) => (
        <button key={n.id} className={`nav-btn ${page === n.id ? 'active' : ''}`} onClick={() => setPage(n.id)}>
          <n.icon /> {n.label}
        </button>
      ))}
      <div className="rail-foot" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{user?.displayName}</div>
          <span className="chip" style={{ marginTop: 4 }}>{ROLE_LABEL[user?.role] ?? user?.role}</span>
        </div>
        <button className="btn sm" onClick={logout}>Sign out</button>
        <div style={{ marginTop: 4 }}>US · UAE · Saudi Arabia · Qatar<br />Kuwait · Bahrain · Oman</div>
      </div>
    </nav>
  );
}
