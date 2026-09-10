import { getCountry, round } from '../../core/index.js';

const PERIODS_PER_YEAR = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

/** Progressive tax on an annualised base, returned as an annual figure. */
function progressiveTax(annualTaxable, brackets) {
  let tax = 0, lower = 0;
  for (const b of brackets) {
    const upper = b.upTo ?? Infinity;
    if (annualTaxable > lower) tax += (Math.min(annualTaxable, upper) - lower) * b.rate;
    lower = upper;
    if (annualTaxable <= upper) break;
  }
  return tax;
}

/** Apply a single contribution line to a periodic contributory wage. */
function contribution(line, periodWage, periodsPerYear, ytdWage = 0) {
  const d = 6;
  let base = periodWage;
  if (line.floor) base = Math.max(base, line.floor);
  if (line.wageBase) {
    // wageBase is annual for US, monthly for GCC schemes — normalise: GCC bases are monthly ceilings.
    const cap = periodsPerYear === 12 ? line.wageBase : line.wageBase / periodsPerYear;
    if (periodsPerYear !== 12) { // annual cap tracking (US)
      const remaining = Math.max(0, line.wageBase - ytdWage);
      base = Math.min(base, remaining);
    } else base = Math.min(base, cap);
  }
  if (line.above) { // additional Medicare style: only on annual wages above threshold
    const annual = periodWage * periodsPerYear;
    base = annual > line.above ? Math.max(0, (annual - line.above) / periodsPerYear) : 0;
  }
  return round(base * line.rate, d);
}

/** End-of-service gratuity accrued for the whole tenure (lump sum if leaving today) plus this period's accrual. */
export function endOfService(country, emp, asOf = new Date()) {
  const cfg = country.endOfService;
  if (!cfg?.enabled) return { accruedTotal: 0, monthlyAccrual: 0, eligible: false, years: 0 };
  const start = new Date(emp.hireDate);
  const years = (asOf - start) / (365.25 * 24 * 3600 * 1000);
  const basis = cfg.basis === 'basic' ? emp.basicSalary : emp.basicSalary + (emp.allowances?.reduce((s, a) => s + a.amount, 0) ?? 0);
  const daily = basis / 30;
  let total = 0, remaining = years, prev = 0;
  for (const t of cfg.tiers) {
    const tierYears = t.uptoYears == null ? remaining : Math.max(0, Math.min(remaining, t.uptoYears - prev));
    total += tierYears * t.daysPerYear * daily;
    remaining -= tierYears; prev = t.uptoYears ?? prev;
    if (remaining <= 0) break;
  }
  if (cfg.capMonths) total = Math.min(total, cfg.capMonths * basis);
  const eligible = years >= (cfg.minServiceYears ?? 0);
  const currentTier = cfg.tiers.find((t) => t.uptoYears == null || years <= t.uptoYears) ?? cfg.tiers.at(-1);
  const monthlyAccrual = (currentTier.daysPerYear * daily) / 12;
  return { accruedTotal: round(total, country.currency.decimals), monthlyAccrual: round(monthlyAccrual, country.currency.decimals), eligible, years: round(years, 2) };
}

/**
 * Calculate one employee's pay for one period.
 * @param emp employee record
 * @param input { overtimeHours, bonus, unpaidDays, ytdWage }
 */
export function calculateEmployee(emp, input = {}) {
  const country = getCountry(emp.country);
  const ccy = country.currency;
  const d = ccy.decimals;
  const ppy = PERIODS_PER_YEAR[country.payFrequency];
  const isNational = emp.nationality === emp.country;
  const warnings = [];

  const allowancesTotal = (emp.allowances ?? []).reduce((s, a) => s + a.amount, 0);
  const periodBasic = round((emp.basicSalary * 12) / ppy, d);
  const periodAllowances = round((allowancesTotal * 12) / ppy, d);

  // Overtime
  const monthlyHours = (country.workWeekHours * 52) / 12;
  const hourlyRate = emp.basicSalary / monthlyHours;
  const otHours = Number(input.overtimeHours ?? 0);
  const otPay = round(otHours * hourlyRate * country.overtime.multiplier, d);
  if (country.overtime.basis === 'daily' && otHours > 2 * 22) warnings.push({ code: 'OT_CAP', message: `Overtime ${otHours}h exceeds the 2 h/day statutory cap`, severity: 'high' });

  const bonus = round(Number(input.bonus ?? 0), d);
  const unpaidDays = Number(input.unpaidDays ?? 0);
  const unpaidDeduction = round((unpaidDays * (periodBasic + periodAllowances)) / 30, d);

  const gross = round(periodBasic + periodAllowances + otPay + bonus - unpaidDeduction, d);

  // Minimum wage
  if (country.minimumWage?.amount) {
    if (country.minimumWage.unit === 'month' && emp.basicSalary < country.minimumWage.amount && (country.code !== 'SA' || isNational))
      warnings.push({ code: 'MIN_WAGE', message: `Basic ${emp.basicSalary} below statutory minimum ${country.minimumWage.amount}`, severity: 'high' });
    if (country.minimumWage.unit === 'hour' && hourlyRate < country.minimumWage.amount)
      warnings.push({ code: 'MIN_WAGE', message: `Hourly rate ${hourlyRate.toFixed(2)} below federal minimum ${country.minimumWage.amount}`, severity: 'high' });
  }

  // Social contributions
  const contribWage = periodBasic + periodAllowances; // contributory salary
  const ss = country.socialSecurity ?? {};
  const employeeLines = [], employerLines = [];
  const appliesEmployee = ss.appliesTo === 'all' || isNational;
  if (appliesEmployee) {
    for (const l of ss.employee ?? []) employeeLines.push({ ...l, amount: contribution(l, ss.appliesTo === 'all' ? gross : contribWage, ppy, input.ytdWage ?? 0) });
    for (const l of ss.employer ?? []) employerLines.push({ ...l, amount: contribution(l, ss.appliesTo === 'all' ? gross : contribWage, ppy, input.ytdWage ?? 0) });
  } else {
    for (const l of ss.expatEmployer ?? []) employerLines.push({ ...l, amount: contribution(l, contribWage, ppy) });
  }

  // Income tax
  let incomeTax = 0, stateTax = 0, taxDetail = null;
  if (country.incomeTax?.enabled) {
    const annualGross = gross * ppy;
    const taxable = Math.max(0, annualGross - (country.incomeTax.standardDeduction ?? 0));
    const annualTax = progressiveTax(taxable, country.incomeTax.brackets);
    incomeTax = round(annualTax / ppy, d);
    const stRate = country.incomeTax.stateTax?.byState?.[emp.state] ?? country.incomeTax.stateTax?.default ?? 0;
    stateTax = round((annualGross * stRate) / ppy, d);
    taxDetail = { annualTaxable: round(taxable, d), effectiveRate: annualGross ? round(annualTax / annualGross, 4) : 0, state: emp.state, stateRate: stRate };
  }

  const otherDeductions = (input.deductions ?? []).reduce((s, x) => s + x.amount, 0);
  const employeeContrib = round(employeeLines.reduce((s, l) => s + l.amount, 0), d);
  const employerContrib = round(employerLines.reduce((s, l) => s + l.amount, 0), d);
  const totalDeductions = round(employeeContrib + incomeTax + stateTax + otherDeductions, d);
  const net = round(gross - totalDeductions, d);
  const eos = endOfService(country, emp);
  const employerCost = round(gross + employerContrib + (eos.monthlyAccrual * 12) / ppy, d);

  if (country.wageProtection?.required && !emp.iban) warnings.push({ code: 'WPS_IBAN', message: `${country.wageProtection.system} requires a registered IBAN`, severity: 'high' });
  if (net < 0) warnings.push({ code: 'NEGATIVE_NET', message: 'Net pay is negative', severity: 'high' });

  return {
    employeeId: emp.id, name: emp.name, country: emp.country, currency: ccy.code, decimals: d,
    payFrequency: country.payFrequency,
    earnings: { basic: periodBasic, allowances: periodAllowances, overtime: otPay, overtimeHours: otHours, bonus, unpaidDeduction, gross },
    deductions: { employeeContributions: employeeLines, incomeTax, stateTax, other: input.deductions ?? [], total: totalDeductions },
    employer: { contributions: employerLines, total: employerContrib, endOfServiceAccrual: round((eos.monthlyAccrual * 12) / ppy, d), totalCost: employerCost },
    net, taxDetail, endOfService: eos, warnings,
  };
}
