import React, { useState } from 'react';
import { AppProvider, useApp } from './lib/AppContext.jsx';
import Rail from './components/Rail.jsx';
import JurisdictionBar from './components/JurisdictionBar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Employees from './pages/Employees.jsx';
import Payroll from './pages/Payroll.jsx';
import Compliance from './pages/Compliance.jsx';
import Assistant from './pages/Assistant.jsx';
import Settings from './pages/Settings.jsx';
import AttendanceLeave from './pages/AttendanceLeave.jsx';
import Reports from './pages/Reports.jsx';
import Login from './pages/Login.jsx';

function Shell() {
  const { loading, authChecked, user } = useApp();
  const [page, setPage] = useState('dashboard');

  if (!authChecked || (user && loading)) return <div style={{ padding: 40 }}>Loading Meridian Payroll…</div>;
  if (!user) return <Login />;

  const Page = { dashboard: Dashboard, employees: Employees, attendance: AttendanceLeave, payroll: Payroll, compliance: Compliance, reports: Reports, assistant: Assistant, settings: Settings }[page];

  return (
    <div className="shell">
      <Rail page={page} setPage={setPage} />
      <div className="main">
        <JurisdictionBar />
        <Page goto={setPage} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
