import React, { useState } from 'react';
import { useApp } from '../lib/AppContext.jsx';

const DEMO_USERS = [
  { username: 'admin@meridian.example', password: 'Admin@2026', role: 'Administrator', desc: 'Full access — settings, compliance rules' },
  { username: 'payroll@meridian.example', password: 'Payroll@2026', role: 'Payroll admin', desc: 'Run payroll, view all data, export reports' },
  { username: 'hr@meridian.example', password: 'HrManager@2026', role: 'HR manager', desc: 'Manage employees, attendance, leave' },
  { username: 'viewer@meridian.example', password: 'Viewer@2026', role: 'Viewer', desc: 'Read-only dashboards and reports' },
];

export default function Login() {
  const { login } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e, overrideUser, overridePass) => {
    e?.preventDefault?.();
    const u = overrideUser ?? username, p = overridePass ?? password;
    setError(''); setBusy(true);
    try { await login(u, p); }
    catch (err) { setError(err.message || 'Login failed'); }
    finally { setBusy(false); }
  };

  const quickLogin = (u) => { setUsername(u.username); setPassword(u.password); submit(null, u.username, u.password); };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--paper)', padding: 20 }}>
      <div style={{ width: 420, maxWidth: '100%' }}>
        <div className="row" style={{ justifyContent: 'center', marginBottom: 22 }}>
          <div className="brand-mark" style={{ width: 36, height: 36, fontSize: 18 }}>M</div>
          <div>
            <div className="display" style={{ fontSize: 20 }}>Meridian Payroll</div>
            <div className="faint">Sign in to continue</div>
          </div>
        </div>

        <div className="panel">
          <form onSubmit={submit} className="list">
            <div className="field">
              <label>Username</label>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="you@meridian.example" autoComplete="username" />
            </div>
            <div className="field">
              <label>Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </div>
            {error && <p className="chip red" style={{ width: 'fit-content' }}>{error}</p>}
            <button className="btn primary" type="submit" disabled={busy || !username || !password} style={{ justifyContent: 'center' }}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="faint" style={{ textAlign: 'center', margin: '18px 0 10px' }}>Demo accounts — one click to try each role</p>
        <div className="list">
          {DEMO_USERS.map((u) => (
            <button key={u.username} className="item" style={{ cursor: 'pointer', textAlign: 'left', width: '100%', background: 'var(--sheet)' }} onClick={() => quickLogin(u)}>
              <span className="dot" style={{ background: 'var(--green)' }} />
              <div>
                <div className="t">{u.role}</div>
                <div className="d">{u.desc}</div>
                <div className="s">{u.username}</div>
              </div>
              <span className="chip">Use</span>
            </button>
          ))}
        </div>
        <p className="faint" style={{ textAlign: 'center', marginTop: 14, fontSize: 11 }}>Demo credentials, published for evaluation. Rotate before using with real data.</p>
      </div>
    </div>
  );
}
