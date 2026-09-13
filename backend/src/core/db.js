import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DB_FILE = process.env.DB_FILE || path.resolve(process.cwd(), 'data', 'meridian.sqlite');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

export const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');   // write-ahead logging: concurrent reads during writes
db.pragma('foreign_keys = ON');    // enforce referential integrity

/* ---------- Schema ---------- */
db.exec(`
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  country TEXT NOT NULL,
  nationality TEXT,
  state TEXT,
  department TEXT,
  title TEXT,
  employment_type TEXT,
  hire_date TEXT NOT NULL,
  basic_salary REAL NOT NULL,
  allowances_json TEXT NOT NULL DEFAULT '[]',
  iban TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  termination_date TEXT
);
CREATE INDEX IF NOT EXISTS idx_employees_country ON employees(country);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);

CREATE TABLE IF NOT EXISTS attendance (
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  country TEXT NOT NULL,
  records_json TEXT NOT NULL,
  PRIMARY KEY (employee_id, period)
);
CREATE INDEX IF NOT EXISTS idx_attendance_period ON attendance(period);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  country TEXT NOT NULL,
  type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  requested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leave_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status);

CREATE TABLE IF NOT EXISTS pay_runs (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL,
  country TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payruns_period ON pay_runs(period);

CREATE TABLE IF NOT EXISTS pay_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  country TEXT NOT NULL,
  currency TEXT NOT NULL,
  gross REAL NOT NULL,
  net REAL NOT NULL,
  overtime_hours REAL NOT NULL DEFAULT 0,
  bonus REAL NOT NULL DEFAULT 0,
  employer_cost REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_period ON pay_history(period);
CREATE INDEX IF NOT EXISTS idx_history_employee ON pay_history(employee_id);

CREATE TABLE IF NOT EXISTS compliance_overrides (
  country TEXT PRIMARY KEY,
  overrides_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  company_name TEXT NOT NULL,
  default_country TEXT NOT NULL,
  reporting_currency TEXT NOT NULL,
  fx_rates_json TEXT,
  fiscal_year_start INTEGER NOT NULL DEFAULT 1,
  ai_provider TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  meta_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'payroll_admin', 'hr_manager', 'viewer')),
  display_name TEXT NOT NULL,
  employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  scope_json TEXT NOT NULL,
  rules_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  applied_at TEXT
);
`);

/* ---------- Bulk load / save helpers ----------
   The application layer works with plain JS arrays in memory (see core/store.js) for
   simplicity in the calculation engine; this module is the only place that touches SQL.
   Writes run inside a single transaction per save() call so the on-disk state is always
   consistent, even though the write pattern is "sync the working set" rather than granular
   per-row statements — a deliberate tradeoff to keep the engine/AI/report modules unchanged
   while getting real ACID durability, indexes, and foreign-key integrity underneath. */

export function loadAll() {
  const employees = db.prepare('SELECT * FROM employees').all().map(rowToEmployee);
  const attendance = db.prepare('SELECT * FROM attendance').all().map((r) => ({ employeeId: r.employee_id, period: r.period, country: r.country, records: JSON.parse(r.records_json) }));
  const leaveRequests = db.prepare('SELECT * FROM leave_requests').all().map((r) => ({ id: r.id, employeeId: r.employee_id, employeeName: r.employee_name, country: r.country, type: r.type, startDate: r.start_date, endDate: r.end_date, days: r.days, status: r.status, reason: r.reason, requestedAt: r.requested_at }));
  const payRuns = db.prepare('SELECT * FROM pay_runs ORDER BY created_at DESC').all().map((r) => JSON.parse(r.payload_json));
  const history = db.prepare('SELECT * FROM pay_history').all().map((r) => ({ period: r.period, employeeId: r.employee_id, country: r.country, currency: r.currency, gross: r.gross, net: r.net, overtimeHours: r.overtime_hours, bonus: r.bonus, employerCost: r.employer_cost }));
  const overridesRows = db.prepare('SELECT * FROM compliance_overrides').all();
  const overrides = Object.fromEntries(overridesRows.map((r) => [r.country, JSON.parse(r.overrides_json)]));
  const settingsRow = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  const settings = settingsRow ? { companyName: settingsRow.company_name, defaultCountry: settingsRow.default_country, reportingCurrency: settingsRow.reporting_currency, fxRates: settingsRow.fx_rates_json ? JSON.parse(settingsRow.fx_rates_json) : null, fiscalYearStart: settingsRow.fiscal_year_start, aiProvider: settingsRow.ai_provider } : null;
  const audit = db.prepare('SELECT * FROM audit_log ORDER BY at DESC LIMIT 500').all().map((r) => ({ id: r.id, at: r.at, actor: r.actor, action: r.action, ...(r.meta_json ? JSON.parse(r.meta_json) : {}) }));
  const policies = db.prepare('SELECT * FROM policies ORDER BY created_at DESC').all().map((r) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  scope: JSON.parse(r.scope_json),
  rules: JSON.parse(r.rules_json),
  status: r.status,
  createdBy: r.created_by,
  createdAt: r.created_at,
  appliedAt: r.applied_at
}));
  // return { employees, attendance, leaveRequests, payRuns, history, overrides, settings, audit };
  return {
  employees,
  attendance,
  leaveRequests,
  payRuns,
  history,
  overrides,
  settings,
  audit,
  policies
};

}

function rowToEmployee(r) {
  return { id: r.id, name: r.name, email: r.email, country: r.country, nationality: r.nationality, state: r.state, department: r.department, title: r.title, employmentType: r.employment_type, hireDate: r.hire_date, basicSalary: r.basic_salary, allowances: JSON.parse(r.allowances_json), iban: r.iban, status: r.status, terminationDate: r.termination_date };
}

const upsertEmployee = db.prepare(`
  INSERT INTO employees (id, name, email, country, nationality, state, department, title, employment_type, hire_date, basic_salary, allowances_json, iban, status, termination_date)
  VALUES (@id, @name, @email, @country, @nationality, @state, @department, @title, @employmentType, @hireDate, @basicSalary, @allowancesJson, @iban, @status, @terminationDate)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, country=excluded.country, nationality=excluded.nationality,
    state=excluded.state, department=excluded.department, title=excluded.title, employment_type=excluded.employment_type,
    hire_date=excluded.hire_date, basic_salary=excluded.basic_salary, allowances_json=excluded.allowances_json,
    iban=excluded.iban, status=excluded.status, termination_date=excluded.termination_date
`);

export const persist = {
  employees: db.transaction((list) => {
    for (const e of list) upsertEmployee.run({ ...e, allowancesJson: JSON.stringify(e.allowances ?? []), email: e.email ?? null, state: e.state ?? null, iban: e.iban ?? null, terminationDate: e.terminationDate ?? null });
  }),
  attendance: db.transaction((list) => {
    const stmt = db.prepare('INSERT INTO attendance (employee_id, period, country, records_json) VALUES (?,?,?,?) ON CONFLICT(employee_id, period) DO UPDATE SET records_json = excluded.records_json');
    for (const a of list) stmt.run(a.employeeId, a.period, a.country, JSON.stringify(a.records));
  }),
  leaveRequests: db.transaction((list) => {
    db.prepare('DELETE FROM leave_requests').run();
    const stmt = db.prepare('INSERT INTO leave_requests (id, employee_id, employee_name, country, type, start_date, end_date, days, status, reason, requested_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    for (const l of list) stmt.run(l.id, l.employeeId, l.employeeName, l.country, l.type, l.startDate, l.endDate, l.days, l.status, l.reason ?? null, l.requestedAt);
  }),
  payRuns: db.transaction((list) => {
    db.prepare('DELETE FROM pay_runs').run();
    const stmt = db.prepare('INSERT INTO pay_runs (id, period, country, created_at, created_by, status, payload_json) VALUES (?,?,?,?,?,?,?)');
    for (const r of list) stmt.run(r.id, r.period, r.country, r.createdAt, r.createdBy, r.status, JSON.stringify(r));
  }),
  history: db.transaction((list) => {
    db.prepare('DELETE FROM pay_history').run();
    const stmt = db.prepare('INSERT INTO pay_history (period, employee_id, country, currency, gross, net, overtime_hours, bonus, employer_cost) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const h of list) stmt.run(h.period, h.employeeId, h.country, h.currency, h.gross, h.net, h.overtimeHours ?? 0, h.bonus ?? 0, h.employerCost);
  }),
  overrides: db.transaction((obj) => {
    db.prepare('DELETE FROM compliance_overrides').run();
    const stmt = db.prepare('INSERT INTO compliance_overrides (country, overrides_json) VALUES (?,?)');
    for (const [country, ov] of Object.entries(obj)) stmt.run(country, JSON.stringify(ov));
  }),
  settings: db.transaction((s) => {
    db.prepare(`
      INSERT INTO settings (id, company_name, default_country, reporting_currency, fx_rates_json, fiscal_year_start, ai_provider)
      VALUES (1, @companyName, @defaultCountry, @reportingCurrency, @fxRatesJson, @fiscalYearStart, @aiProvider)
      ON CONFLICT(id) DO UPDATE SET company_name=excluded.company_name, default_country=excluded.default_country,
        reporting_currency=excluded.reporting_currency, fx_rates_json=excluded.fx_rates_json,
        fiscal_year_start=excluded.fiscal_year_start, ai_provider=excluded.ai_provider
    `).run({ ...s, fxRatesJson: s.fxRates ? JSON.stringify(s.fxRates) : null });
  }),
  audit: db.transaction((list) => {
    db.prepare('DELETE FROM audit_log').run();
    const stmt = db.prepare('INSERT INTO audit_log (id, at, actor, action, meta_json) VALUES (?,?,?,?,?)');
    for (const a of list.slice(0, 500)) { const { id, at, actor, action, ...meta } = a; stmt.run(id, at, actor, action, JSON.stringify(meta)); }
  }),
    policies: db.transaction((list) => {
    db.prepare('DELETE FROM policies').run();

    const stmt = db.prepare(
      'INSERT INTO policies (id, name, description, scope_json, rules_json, status, created_by, created_at, applied_at) VALUES (?,?,?,?,?,?,?,?,?)'
    );

    for (const p of list) {
      stmt.run(
        p.id,
        p.name,
        p.description ?? null,
        JSON.stringify(p.scope),
        JSON.stringify(p.rules),
        p.status,
        p.createdBy,
        p.createdAt,
        p.appliedAt ?? null
      );
    }
  }),
};

export function countEmployees() { return db.prepare('SELECT COUNT(*) AS n FROM employees').get().n; }
export function countUsers() { return db.prepare('SELECT COUNT(*) AS n FROM users').get().n; }
