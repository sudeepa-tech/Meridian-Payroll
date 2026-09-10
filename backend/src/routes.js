import { Router } from 'express';
import { store, getCountry, wrap, validate, notFound, badRequest, convert, round } from './core/index.js';
import { COUNTRIES, CURRENCIES, FX_RATES } from './config/countries.js';
import { calculateEmployee, endOfService } from './modules/payroll/engine.js';
import { summarizeAttendance, leaveBalance } from './modules/attendance/engine.js';
import * as ai from './modules/ai/service.js';
import * as reports from './modules/reports/service.js';
import { login, requireRole, requireAuth as requireAuthLocal, ROLES } from './core/auth.js';

const actor = (req) => req.user?.username || req.header('x-user') || 'admin@meridian.example';
const rates = () => store.state.settings?.fxRates ?? FX_RATES;

/* ===== Auth ===== */
export const authRouter = Router();
authRouter.post('/login', wrap((req, res) => {
  validate(req.body ?? {}, { username: { required: true, type: 'string' }, password: { required: true, type: 'string' } });
  const result = login(req.body.username, req.body.password);
  if (!result) throw badRequest('Invalid username or password');
  res.json(result);
}));
authRouter.get('/me', requireAuthLocal, (req, res) => res.json({ user: req.user, roles: ROLES }));

/* ===== Settings & reference data ===== */
export const settings = Router();
settings.get('/', (req, res) => res.json({ ...store.state.settings, fxRates: rates(), fxDefaults: FX_RATES }));
settings.put('/', requireRole('admin'), wrap((req, res) => {
  const { reportingCurrency, defaultCountry, companyName, fxRates } = req.body;
  if (reportingCurrency && !CURRENCIES[reportingCurrency]) throw badRequest('Unknown currency');
  if (defaultCountry && !COUNTRIES[defaultCountry]) throw badRequest('Unknown country');
  Object.assign(store.state.settings, { ...(reportingCurrency && { reportingCurrency }), ...(defaultCountry && { defaultCountry }), ...(companyName && { companyName }), ...(fxRates !== undefined && { fxRates }) });
  store.audit(actor(req), 'settings.update', { changes: Object.keys(req.body) });
  store.save();
  res.json({ ...store.state.settings, fxRates: rates() });
}));
settings.get('/countries', (req, res) => res.json(Object.keys(COUNTRIES).map((c) => { const k = getCountry(c); return { code: k.code, name: k.name, region: k.region, currency: k.currency, payFrequency: k.payFrequency, workWeekHours: k.workWeekHours, overtime: k.overtime, leave: k.leave, wageProtection: k.wageProtection }; })));
settings.get('/countries/:code', wrap((req, res) => res.json(getCountry(req.params.code.toUpperCase()))));
settings.get('/currencies', (req, res) => res.json(Object.entries(CURRENCIES).map(([code, c]) => ({ code, ...c, rateToUsd: rates()[code] }))));
settings.get('/audit', (req, res) => res.json(store.state.audit.slice(0, 100)));

/* ===== Compliance: runtime overrides of the rule registry ===== */
export const compliance = Router();
compliance.get('/:code', wrap((req, res) => {
  const code = req.params.code.toUpperCase();
  res.json({ effective: getCountry(code), overrides: store.state.overrides[code] ?? {}, defaults: COUNTRIES[code] });
}));
compliance.put('/:code', requireRole('admin'), wrap((req, res) => {
  const code = req.params.code.toUpperCase();
  if (!COUNTRIES[code]) throw notFound('Country');
  store.state.overrides[code] = req.body ?? {};
  store.audit(actor(req), 'compliance.override', { country: code, paths: Object.keys(req.body ?? {}) });
  store.save();
  res.json({ effective: getCountry(code), overrides: store.state.overrides[code] });
}));
compliance.delete('/:code', requireRole('admin'), wrap((req, res) => {
  const code = req.params.code.toUpperCase();
  delete store.state.overrides[code];
  store.audit(actor(req), 'compliance.reset', { country: code });
  store.save();
  res.json({ effective: getCountry(code), overrides: {} });
}));
compliance.get('/:code/checklist', wrap((req, res) => {
  const code = req.params.code.toUpperCase();
  const c = getCountry(code);
  const emps = store.state.employees.filter((e) => e.country === code && e.status === 'active');
  const items = c.compliance.map((item) => {
    let status = 'pass', detail = '';
    if (item.id === 'iban' || item.id === 'wps' || item.id === 'mudad' || item.id === 'lmra' || item.id === 'mosal') { const n = emps.filter((e) => !e.iban).length; if (n) { status = 'fail'; detail = `${n} employee(s) without IBAN`; } }
    if (item.id === 'min_wage') { const n = emps.filter((e) => e.basicSalary < (c.minimumWage.amount ?? 0)).length; if (n) { status = 'fail'; detail = `${n} below minimum`; } }
    if (['nitaqat', 'bahrainisation', 'omanisation'].includes(item.id)) { const r = emps.filter((e) => e.nationality === code).length / (emps.length || 1); status = r >= 0.2 ? 'pass' : 'warn'; detail = `${(r * 100).toFixed(0)}% nationals`; }
    if (['w4', 'i9', 'emirates_id', 'iqama', 'qid', 'civil_id', 'cpr', 'contract_qiwa', 'gosi_reg'].includes(item.id)) { status = 'manual'; detail = 'Tracked in HRIS'; }
    return { ...item, status, detail };
  });
  res.json({ country: code, headcount: emps.length, items });
}));

/* ===== Employees ===== */
export const employees = Router();
const empSchema = { name: { required: true, type: 'string' }, country: { required: true, oneOf: Object.keys(COUNTRIES) }, basicSalary: { required: true, type: 'number', min: 0 }, hireDate: { required: true, type: 'string' }, nationality: { type: 'string' }, department: { type: 'string' } };
employees.get('/', (req, res) => {
  const { country, q, department } = req.query;
  let list = store.state.employees;
  if (country) list = list.filter((e) => e.country === String(country).toUpperCase());
  if (department) list = list.filter((e) => e.department === department);
  if (q) { const s = String(q).toLowerCase(); list = list.filter((e) => e.name.toLowerCase().includes(s) || e.id.toLowerCase().includes(s) || e.title.toLowerCase().includes(s)); }
  res.json(list);
});
employees.get('/:id', wrap((req, res) => {
  const e = store.state.employees.find((x) => x.id === req.params.id);
  if (!e) throw notFound('Employee');
  const c = getCountry(e.country);
  res.json({ ...e, preview: calculateEmployee(e), endOfService: endOfService(c, e), history: store.state.history.filter((h) => h.employeeId === e.id) });
}));
employees.post('/', requireRole('hr_manager', 'admin'), wrap((req, res) => {
  validate(req.body, empSchema);
  const id = `EMP-${String(store.state.employees.length + 1).padStart(4, '0')}`;
  const e = { id, status: 'active', allowances: [], nationality: req.body.country, ...req.body };
  store.state.employees.push(e);
  store.audit(actor(req), 'employee.create', { id });
  store.save();
  res.status(201).json(e);
}));
employees.put('/:id', requireRole('hr_manager', 'admin'), wrap((req, res) => {
  const i = store.state.employees.findIndex((x) => x.id === req.params.id);
  if (i < 0) throw notFound('Employee');
  store.state.employees[i] = { ...store.state.employees[i], ...req.body, id: req.params.id };
  store.audit(actor(req), 'employee.update', { id: req.params.id, fields: Object.keys(req.body) });
  store.save();
  res.json(store.state.employees[i]);
}));
employees.delete('/:id', requireRole('hr_manager', 'admin'), wrap((req, res) => {
  const e = store.state.employees.find((x) => x.id === req.params.id);
  if (!e) throw notFound('Employee');
  e.status = 'terminated'; e.terminationDate = new Date().toISOString().slice(0, 10);
  store.audit(actor(req), 'employee.terminate', { id: e.id });
  store.save();
  res.json({ ...e, finalSettlement: endOfService(getCountry(e.country), e) });
}));

/* ===== Payroll ===== */
export const payroll = Router();
function attendanceInputFor(empId, period) {
  const rec = store.state.attendance.find((a) => a.employeeId === empId && a.period === period);
  if (!rec) return {};
  const emp = store.state.employees.find((e) => e.id === empId);
  const summary = summarizeAttendance(emp.country, rec.records);
  return { overtimeHours: summary.overtimeHours, unpaidDays: summary.unpaidLeaveDays, attendanceSummary: summary };
}
function runPreview(country, period, inputs = {}) {
  const emps = store.state.employees.filter((e) => e.status === 'active' && (!country || e.country === country));
  const results = emps.map((e) => {
    const derived = attendanceInputFor(e.id, period);
    const merged = { ...derived, ...(inputs[e.id] ?? {}) };
    const r = calculateEmployee(e, merged);
    r.attendance = derived.attendanceSummary ?? null;
    if (derived.attendanceSummary?.exceptions.length) {
      for (const ex of derived.attendanceSummary.exceptions) r.warnings.push({ code: ex.code, message: ex.message, severity: 'medium' });
    }
    return r;
  });
  const rc = store.state.settings.reportingCurrency;
  const totals = {};
  for (const r of results) {
    const t = (totals[r.currency] ??= { currency: r.currency, headcount: 0, gross: 0, deductions: 0, net: 0, employerContributions: 0, employerCost: 0, eosAccrual: 0 });
    t.headcount++; t.gross += r.earnings.gross; t.deductions += r.deductions.total; t.net += r.net; t.employerContributions += r.employer.total; t.employerCost += r.employer.totalCost; t.eosAccrual += r.employer.endOfServiceAccrual;
  }
  for (const t of Object.values(totals)) for (const k of ['gross', 'deductions', 'net', 'employerContributions', 'employerCost', 'eosAccrual']) t[k] = round(t[k], 3);
  const consolidated = { currency: rc, gross: 0, net: 0, employerCost: 0 };
  for (const t of Object.values(totals)) { consolidated.gross += convert(t.gross, t.currency, rc, rates()); consolidated.net += convert(t.net, t.currency, rc, rates()); consolidated.employerCost += convert(t.employerCost, t.currency, rc, rates()); }
  for (const k of ['gross', 'net', 'employerCost']) consolidated[k] = round(consolidated[k], 2);
  return { period, country: country ?? 'ALL', results, totals: Object.values(totals), consolidated, anomalies: ai.detectAnomalies(results) };
}
payroll.post('/preview', wrap((req, res) => {
  const { country, period = '2026-09', inputs } = req.body ?? {};
  res.json(runPreview(country ? country.toUpperCase() : undefined, period, inputs));
}));
payroll.post('/runs', requireRole('payroll_admin', 'admin'), wrap((req, res) => {
  const { country, period = '2026-09', inputs, approve } = req.body ?? {};
  const preview = runPreview(country ? country.toUpperCase() : undefined, period, inputs);
  const blocking = preview.results.flatMap((r) => r.warnings.filter((w) => w.severity === 'high').map((w) => ({ employee: r.name, ...w })));
  if (blocking.length && !approve) throw badRequest(`${blocking.length} blocking compliance warning(s). Resolve them or pass approve:true with a justification.`, blocking);
  const run = { id: `RUN-${period}-${(preview.country)}-${Date.now().toString(36).toUpperCase()}`, createdAt: new Date().toISOString(), createdBy: actor(req), status: 'approved', ...preview };
  store.state.payRuns.unshift(run);
  for (const r of preview.results) store.state.history.push({ period, employeeId: r.employeeId, country: r.country, currency: r.currency, gross: r.earnings.gross, net: r.net, overtimeHours: r.earnings.overtimeHours, bonus: r.earnings.bonus, employerCost: r.employer.totalCost });
  store.audit(actor(req), 'payroll.run', { id: run.id, headcount: preview.results.length, overridden: blocking.length });
  store.save();
  res.status(201).json(run);
}));
payroll.get('/runs', (req, res) => res.json(store.state.payRuns.map(({ results, ...r }) => ({ ...r, headcount: results.length }))));
payroll.get('/runs/:id', wrap((req, res) => { const r = store.state.payRuns.find((x) => x.id === req.params.id); if (!r) throw notFound('Pay run'); res.json(r); }));
payroll.get('/runs/:id/wps', wrap((req, res) => {
  // Salary Information File (SIF-style) export for GCC wage protection systems
  const r = store.state.payRuns.find((x) => x.id === req.params.id); if (!r) throw notFound('Pay run');
  const lines = r.results.filter((x) => x.country !== 'US').map((x) => { const e = store.state.employees.find((y) => y.id === x.employeeId); return ['EDR', x.employeeId, e?.iban ?? '', r.period, x.earnings.basic.toFixed(x.decimals), (x.net - x.earnings.basic).toFixed(x.decimals), x.net.toFixed(x.decimals), x.currency].join(','); });
  res.type('text/csv').send(['SCR,MERIDIAN,' + r.period + ',' + lines.length].concat(lines).join('\n'));
}));
payroll.get('/history', (req, res) => {
  const rc = store.state.settings.reportingCurrency;
  const byPeriod = {};
  for (const h of store.state.history) { const b = (byPeriod[h.period] ??= { period: h.period, gross: 0, net: 0, employerCost: 0, byCountry: {} }); b.gross += convert(h.gross, h.currency, rc, rates()); b.net += convert(h.net, h.currency, rc, rates()); b.employerCost += convert(h.employerCost, h.currency, rc, rates()); b.byCountry[h.country] = (b.byCountry[h.country] ?? 0) + convert(h.employerCost, h.currency, rc, rates()); }
  res.json({ currency: rc, periods: Object.values(byPeriod).sort((a, b) => a.period.localeCompare(b.period)).map((p) => ({ ...p, gross: round(p.gross, 2), net: round(p.net, 2), employerCost: round(p.employerCost, 2), byCountry: Object.fromEntries(Object.entries(p.byCountry).map(([k, v]) => [k, round(v, 2)])) })) });
});
payroll.get('/dashboard', (req, res) => {
  const p = runPreview(undefined, '2026-09');
  const rc = store.state.settings.reportingCurrency;
  const byCountry = {};
  for (const r of p.results) { const b = (byCountry[r.country] ??= { country: r.country, currency: r.currency, headcount: 0, employerCost: 0, net: 0, reporting: 0 }); b.headcount++; b.employerCost += r.employer.totalCost; b.net += r.net; b.reporting += convert(r.employer.totalCost, r.currency, rc, rates()); }
  res.json({ period: p.period, consolidated: p.consolidated, headcount: p.results.length, byCountry: Object.values(byCountry).map((b) => ({ ...b, employerCost: round(b.employerCost, 3), net: round(b.net, 3), reporting: round(b.reporting, 2) })), anomalies: p.anomalies.slice(0, 6), anomalyCount: p.anomalies.length, risks: ai.riskScores(), recentRuns: store.state.payRuns.slice(0, 5).map(({ results, ...r }) => ({ ...r, headcount: results.length })) });
});

/* ===== AI ===== */
export const aiRouter = Router();
aiRouter.get('/forecast', (req, res) => res.json(ai.forecast(Number(req.query.months ?? 6))));
aiRouter.get('/risks', (req, res) => res.json(ai.riskScores()));
aiRouter.get('/integrity', (req, res) => res.json(ai.integrityChecks(store.state.employees.filter((e) => e.status === 'active'))));
aiRouter.post('/ask', wrap(async (req, res) => { validate(req.body ?? {}, { question: { required: true, type: 'string' } }); res.json(await ai.ask(req.body.question)); }));

/* ===== Attendance ===== */
export const attendanceRouter = Router();
attendanceRouter.get('/', (req, res) => {
  const { country, period = '2026-09' } = req.query;
  let recs = store.state.attendance.filter((a) => a.period === period);
  if (country) recs = recs.filter((a) => a.country === String(country).toUpperCase());
  const enriched = recs.map((a) => {
    const emp = store.state.employees.find((e) => e.id === a.employeeId);
    const summary = summarizeAttendance(a.country, a.records);
    return { employeeId: a.employeeId, name: emp?.name, country: a.country, department: emp?.department, period: a.period, summary };
  });
  res.json(enriched);
});
attendanceRouter.get('/:employeeId', wrap((req, res) => {
  const { period = '2026-09' } = req.query;
  const rec = store.state.attendance.find((a) => a.employeeId === req.params.employeeId && a.period === period);
  if (!rec) throw notFound('Attendance record');
  const summary = summarizeAttendance(rec.country, rec.records);
  res.json({ ...rec, summary });
}));
attendanceRouter.get('/summary/overview', (req, res) => {
  const { period = '2026-09' } = req.query;
  const recs = store.state.attendance.filter((a) => a.period === period);
  let totalLate = 0, totalAbsent = 0, totalOtHours = 0, totalExceptions = 0;
  const byCountry = {};
  for (const a of recs) {
    const s = summarizeAttendance(a.country, a.records);
    totalLate += s.lateCount; totalAbsent += s.absentDays; totalOtHours += s.overtimeHours; totalExceptions += s.exceptions.length;
    const b = (byCountry[a.country] ??= { country: a.country, lateCount: 0, absentDays: 0, overtimeHours: 0, headcount: 0 });
    b.lateCount += s.lateCount; b.absentDays += s.absentDays; b.overtimeHours += round(s.overtimeHours, 1); b.headcount++;
  }
  res.json({ period, totals: { lateCount: totalLate, absentDays: totalAbsent, overtimeHours: round(totalOtHours, 1), exceptions: totalExceptions }, byCountry: Object.values(byCountry) });
});

/* ===== Leave ===== */
export const leaveRouter = Router();
leaveRouter.get('/requests', (req, res) => {
  const { country, status } = req.query;
  let list = store.state.leaveRequests;
  if (country) list = list.filter((l) => l.country === String(country).toUpperCase());
  if (status) list = list.filter((l) => l.status === status);
  res.json(list.slice().sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)));
});
leaveRouter.post('/requests/:id/decision', requireRole('hr_manager', 'admin'), wrap((req, res) => {
  const { decision } = req.body ?? {};
  if (!['approved', 'rejected'].includes(decision)) throw badRequest('decision must be approved or rejected');
  const l = store.state.leaveRequests.find((x) => x.id === req.params.id);
  if (!l) throw notFound('Leave request');
  l.status = decision;
  store.audit(actor(req), 'leave.decision', { id: l.id, decision });
  store.save();
  res.json(l);
}));
leaveRouter.get('/balances/:employeeId', wrap((req, res) => {
  const emp = store.state.employees.find((e) => e.id === req.params.employeeId);
  if (!emp) throw notFound('Employee');
  const taken = { annual: 0, sick: 0, unpaid: 0 };
  for (const l of store.state.leaveRequests) if (l.employeeId === emp.id && l.status === 'approved' && taken[l.type] !== undefined) taken[l.type] += l.days;
  const c = getCountry(emp.country);
  const out = ['annual', 'sick'].filter((t) => c.leave?.[t]).map((t) => leaveBalance(emp.country, emp, t, taken[t] ?? 0));
  res.json({ employeeId: emp.id, name: emp.name, country: emp.country, balances: out, unpaidDaysTaken: taken.unpaid });
}));

/* ===== Reports ===== */
export const reportsRouter = Router();
reportsRouter.get('/payroll-register.xlsx', wrap(async (req, res) => {
  const { country, period = '2026-09' } = req.query;
  const buf = await reports.payrollRegisterXlsx(runPreview(country ? country.toUpperCase() : undefined, period));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="payroll-register-${period}.xlsx"`);
  res.send(buf);
}));
reportsRouter.get('/payroll-summary.pdf', wrap(async (req, res) => {
  const { country, period = '2026-09' } = req.query;
  const preview = runPreview(country ? country.toUpperCase() : undefined, period);
  const buf = await reports.payrollSummaryPdf(preview, store.state.settings);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="payroll-summary-${period}.pdf"`);
  res.send(buf);
}));
reportsRouter.get('/cost-by-country.xlsx', wrap(async (req, res) => {
  const buf = await reports.costByCountryXlsx(store.state.history, store.state.settings, FX_RATES);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="cost-by-country.xlsx"`);
  res.send(buf);
}));
reportsRouter.get('/compliance-risk.pdf', wrap(async (req, res) => {
  const buf = await reports.complianceRiskPdf(ai.riskScores(), store.state.settings);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="compliance-risk.pdf"`);
  res.send(buf);
}));
