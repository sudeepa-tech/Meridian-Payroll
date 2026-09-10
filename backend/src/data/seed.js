import { store } from '../core/index.js';
import { calculateEmployee } from '../modules/payroll/engine.js';

// Deterministic PRNG so sample data is stable between restarts
let s = 20260909;
const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + rnd() * (hi - lo);

const FIRST = ['Amira', 'Noah', 'Fatima', 'Liam', 'Omar', 'Sofia', 'Yusuf', 'Emma', 'Layla', 'Ethan', 'Hassan', 'Olivia', 'Zainab', 'Mason', 'Khalid', 'Ava', 'Rania', 'Lucas', 'Tariq', 'Mia', 'Salma', 'James', 'Faisal', 'Chloe', 'Nour', 'Daniel', 'Maryam', 'Aiden', 'Sara', 'Elijah', 'Hind', 'Ryan', 'Reem', 'Oliver', 'Mohammed', 'Grace', 'Huda', 'Leo', 'Dana', 'Jack'];
const LAST = ['Al Mansoori', 'Carter', 'Al Qahtani', 'Bennett', 'Haddad', 'Nguyen', 'Al Thani', 'Patel', 'Rahman', 'Kim', 'Al Sabah', 'Morgan', 'Farouk', 'Reyes', 'Al Khalifa', 'Okafor', 'Saleh', 'Dubois', 'Al Busaidi', 'Cohen'];
const DEPTS = ['Engineering', 'Finance', 'Operations', 'Sales', 'People', 'Legal', 'Product', 'Marketing'];
const TITLES = { Engineering: ['Software Engineer', 'Staff Engineer', 'Engineering Manager', 'SRE'], Finance: ['Financial Analyst', 'Controller', 'Accountant'], Operations: ['Operations Lead', 'Logistics Coordinator'], Sales: ['Account Executive', 'Sales Director'], People: ['HR Business Partner', 'Recruiter'], Legal: ['Counsel', 'Paralegal'], Product: ['Product Manager', 'Designer'], Marketing: ['Growth Manager', 'Content Lead'] };

// Monthly basic salary bands in local currency
const BANDS = {
  US: { basic: [4500, 16000], states: ['CA', 'NY', 'TX', 'WA', 'FL', 'IL', 'MA'], nationals: ['US', 'US', 'US', 'IN', 'MX'] },
  AE: { basic: [8000, 45000], nationals: ['AE', 'IN', 'PK', 'EG', 'GB', 'PH'] },
  SA: { basic: [6000, 40000], nationals: ['SA', 'SA', 'IN', 'EG', 'PK'] },
  QA: { basic: [7000, 38000], nationals: ['QA', 'IN', 'NP', 'GB', 'LB'] },
  KW: { basic: [600, 3500], nationals: ['KW', 'IN', 'EG', 'PH'] },
  BH: { basic: [500, 3000], nationals: ['BH', 'BH', 'IN', 'PK'] },
  OM: { basic: [500, 3200], nationals: ['OM', 'OM', 'IN', 'BD'] },
};
const COUNTS = { US: 18, AE: 14, SA: 12, QA: 6, KW: 4, BH: 4, OM: 4 };
const IBAN_PREFIX = { AE: 'AE07 0331 2345 6789 0123 456', SA: 'SA03 8000 0000 6080 1016 7519', QA: 'QA58 DOHB 0000 1234 5678 90AB CDEF G', KW: 'KW81 CBKU 0000 0000 0000 1234 5601 01', BH: 'BH67 BMAG 0000 1299 1234 56', OM: 'OM47 0011 0000 0000 0001 2345 6' };

function makeEmployee(i, country) {
  const band = BANDS[country];
  const dept = pick(DEPTS);
  const basic = Math.round(between(...band.basic) / 50) * 50;
  const hire = new Date(2026 - Math.floor(between(0, 9)), Math.floor(between(0, 12)), 1 + Math.floor(between(0, 27)));
  const allowances = country === 'US' ? [] : [
    { type: 'Housing', amount: Math.round(basic * 0.25) },
    { type: 'Transport', amount: Math.round(basic * 0.1) },
  ];
  const missingIban = country !== 'US' && rnd() < 0.06;
  return {
    id: `EMP-${String(i).padStart(4, '0')}`,
    name: `${pick(FIRST)} ${pick(LAST)}`,
    email: `emp${i}@meridian.example`,
    country, nationality: pick(band.nationals),
    state: country === 'US' ? pick(band.states) : undefined,
    department: dept, title: pick(TITLES[dept]),
    employmentType: rnd() < 0.9 ? 'full-time' : 'contract',
    hireDate: hire.toISOString().slice(0, 10),
    basicSalary: basic, allowances,
    iban: missingIban ? null : (country === 'US' ? `US-ACH-${100000 + i}` : IBAN_PREFIX[country]),
    status: 'active',
  };
}

export function seedIfEmpty() {
  if (store.state.employees.length) return;
  let i = 1;
  const employees = [];
  for (const [country, n] of Object.entries(COUNTS)) for (let k = 0; k < n; k++) employees.push(makeEmployee(i++, country));
  store.state.employees = employees;

  // 8 months of pay history (Jan–Aug 2026) so the AI modules have a baseline
  const history = [];
  for (let m = 0; m < 8; m++) {
    const period = `2026-${String(m + 1).padStart(2, '0')}`;
    for (const e of employees) {
      const ot = rnd() < 0.3 ? Math.round(between(2, 18)) : 0;
      const bonus = m === 2 && rnd() < 0.5 ? Math.round(e.basicSalary * between(0.1, 0.5)) : 0;
      const r = calculateEmployee(e, { overtimeHours: ot, bonus });
      history.push({ period, employeeId: e.id, country: e.country, currency: r.currency, gross: r.earnings.gross, net: r.net, overtimeHours: ot, bonus, employerCost: r.employer.totalCost });
    }
  }
  store.state.history = history;
  store.state.settings = {
    companyName: 'Meridian Holdings',
    defaultCountry: 'US',
    reportingCurrency: 'USD',
    fxRates: null, // null = use config defaults
    fiscalYearStart: 1,
    aiProvider: process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'local',
  };
  store.audit('system', 'seed', { employees: employees.length, historyRows: history.length });
  store.save();
}
