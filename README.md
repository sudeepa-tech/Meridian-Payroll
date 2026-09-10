# Meridian Payroll

A production-shaped, modular payroll platform for the United States and six Middle East
markets (UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman), with an AI layer for anomaly
detection, cost forecasting, compliance risk scoring, and a grounded chat assistant.

## Stack

- **Backend:** Node.js + Express (ESM), a country-registry-driven payroll rule engine,
  SQLite (via `better-sqlite3`) for real relational persistence — proper schema, foreign
  keys, indexes, WAL journaling.
- **Auth:** JWT-based login with four roles (`admin`, `payroll_admin`, `hr_manager`,
  `viewer`), enforced server-side on every mutating route. Passwords hashed with `bcryptjs`.
- **Frontend:** React 18 + Vite, hand-built design system (no UI kit), Recharts for charts.
- **AI:** Uses the Anthropic API (`claude-sonnet-4-6`) if `ANTHROPIC_API_KEY` is set on the
  backend; otherwise falls back to a deterministic local analytical engine so the app is
  fully functional with zero external dependencies.
- **Reports:** Real PDF generation via `pdfkit` and Excel generation via `exceljs` — every
  export button produces an actual, correctly-formatted file, not a stub.

## Quick start

Requires Node.js 18+.

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env      # optionally add ANTHROPIC_API_KEY and JWT_SECRET
npm start                 # http://localhost:4000

# 2. Frontend (separate terminal)
cd frontend
npm install
npm run dev                # http://localhost:5173
```

Open http://localhost:5173. You'll land on a login screen — use one of the four seeded demo
accounts (shown on the login page, also printed to the backend console on first boot):

| Username | Password | Role | Can do |
|---|---|---|---|
| admin@meridian.example | Admin@2026 | Administrator | Everything, including settings & compliance rule edits |
| payroll@meridian.example | Payroll@2026 | Payroll admin | Run payroll, view everything, export reports |
| hr@meridian.example | HrManager@2026 | HR manager | Manage employees, attendance, leave approvals |
| viewer@meridian.example | Viewer@2026 | Viewer | Read-only |

The backend seeds 62 sample employees across all seven countries, 8 months of pay history,
a full September 2026 attendance/leave dataset, and these four users automatically on first
run (stored at `backend/data/meridian.sqlite` — delete this file to reseed from scratch).

Run backend tests: `cd backend && npm test`

> **Note:** `better-sqlite3` is a native module (prebuilt binary, no compiler needed on
> common platforms). If `npm install` is interrupted or run with `--silent` on a slow
> connection, the binary can end up partially fetched, causing `ERR_MODULE_NOT_FOUND` at
> runtime. If you hit that, `rm -rf node_modules package-lock.json && npm install` (without
> `--silent`) fixes it.

## Project layout

```
backend/
  src/
    config/countries.js      # the jurisdiction rule registry — tax, social security,
                                overtime rounding/caps, leave entitlements, one entry per country
    core/
      db.js                     # SQLite schema + bulk load/persist helpers (the only file
                                   that touches SQL directly)
      index.js                   # in-memory Store class (backed by db.js), money helpers,
                                   validation, errors
      auth.js                     # password hashing, JWT issuing/verification, RBAC middleware
    data/
      seed.js                  # deterministic sample employee/pay-history generator
      seedAttendance.js         # deterministic timesheet & leave request generator
    modules/
      payroll/engine.js        # tax, social contributions, overtime, gratuity calculation
      attendance/engine.js      # minute-level overtime rounding, leave accrual & balances
      ai/service.js              # anomaly detection, forecasting, risk scoring, chat
      reports/service.js          # PDF (pdfkit) and XLSX (exceljs) report generation
    routes.js                  # all REST endpoints, role-gated where they mutate data
    server.js                  # Express app entry point, mounts the global auth gate
  test/engine.test.js          # payroll engine unit tests (node:test)

frontend/
  src/
    lib/
      api.js                     # typed fetch client — attaches the JWT, handles 401s
      AppContext.jsx               # global state: auth session, selected country, settings
    components/                # Rail (nav + role badge + sign-out), JurisdictionBar, Icon set
    pages/
      Login.jsx                  # sign-in screen with one-click demo-role buttons
      Dashboard.jsx                # consolidated cost ledger, forecast, anomaly/risk feeds
      Employees.jsx                 # roster + payslip drawer
      AttendanceLeave.jsx            # timesheets, overtime rules, leave request queue
      Payroll.jsx                     # run preview, AI review, approve, WPS export
      Compliance.jsx                   # editable rule registry per country + checklist
      Reports.jsx                       # charts + PDF/XLSX export center
      Assistant.jsx                      # AI chat grounded in live data
      Settings.jsx                        # company profile, FX rates, audit trail
    styles.css                 # design tokens and component styles
```

## Key design decisions

- **Countries are data, not code.** Adding a new jurisdiction means adding an entry to
  `config/countries.js` — tax brackets, social security lines, overtime rounding rules and
  daily/weekly caps, leave entitlements, wage protection requirements. The engine and every
  UI page read this registry, so no calculation logic needs to change.
- **Overtime is derived from real timesheets, not manual entry.** The payroll preview pulls
  each employee's attendance records for the period, applies the country's rounding rule
  (US: FLSA 15-minute nearest; GCC: 30-minute round-up with a 2-hour daily cap) and basis
  (daily vs weekly), and feeds the resulting hours straight into the pay calculation. Cap
  breaches surface automatically as AI-review warnings.
- **Persistence is real SQLite, not a JSON blob.** `core/db.js` defines an actual relational
  schema (foreign keys, indexes, WAL mode) and is the only module that touches SQL directly.
  The rest of the app works against plain JS arrays in memory for simplicity — every mutating
  route calls `store.save()`, which runs a transactional bulk-sync of the changed entity to
  SQLite. This was verified by killing the server process mid-session and confirming a
  completed pay run was still there after restart.
- **Access control is enforced server-side, not just hidden in the UI.** Every mutating route
  (`employees.post/put/delete`, `payroll.post('/runs')`, `compliance.put/delete`,
  `settings.put`, `leave.../decision`) checks the caller's role via `requireRole(...)` in
  `core/auth.js` before touching the database. The frontend also disables/relabels the
  relevant buttons per role, but that's a UX courtesy — the backend check is what actually
  stops an unauthorized action, confirmed by testing a Viewer token against a payroll-run
  endpoint directly (403, not 200).
- **Compliance overrides are layered, not destructive.** `PUT /api/compliance/:code` stores
  a partial override that's deep-merged onto the statutory default at read time, so you can
  always reset back to the legal baseline.
- **AI is additive, not load-bearing.** Every AI feature (anomaly detection, forecast, risk
  score, chat) degrades gracefully to a deterministic local implementation without an API key,
  so the app is fully demoable and testable offline.
- **Reports are real files.** PDF and XLSX exports are generated server-side from the same
  data the UI renders — no mock downloads.
- **Money is always tagged with its currency.** Consolidated reporting-currency totals are
  computed via explicit FX conversion at the point of aggregation, never by assuming a shared
  currency.

## Honest limitations

This is a strong prototype, not a production-hardened system. Before this touches real
payroll data it needs, at minimum: a persistent `JWT_SECRET` (otherwise every restart
invalidates all sessions), rotated/removed demo passwords, a password-reset flow, login
rate-limiting, MFA, session revocation, encryption at rest, a real audit trail tied to
authenticated identity end-to-end, and legal review of every tax bracket and labor-law figure
in `config/countries.js` against current statute. None of that is implemented here.

## Important disclaimer

Tax brackets, social security rates, overtime rules, and end-of-service formulas are
configured as a realistic starting point for the 2026 payroll year but **must be verified
against current statutes with qualified local counsel** before any production or compliance
use. Labor law changes frequently in every jurisdiction covered here.
