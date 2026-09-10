import { getCountry, round } from '../../core/index.js';

/** Round a raw minutes value per the country's overtime rounding policy. */
export function roundMinutes(minutes, rounding) {
  if (!rounding || minutes <= 0) return Math.max(0, minutes);
  const inc = rounding.increment;
  if (rounding.rule === 'up') return Math.ceil(minutes / inc) * inc;
  if (rounding.rule === 'down') return Math.floor(minutes / inc) * inc;
  return Math.round(minutes / inc) * inc; // 'nearest' — the FLSA-permitted 7-minute rule at 15-min increments
}

/**
 * Reduce a set of daily attendance punches into overtime hours, unpaid days, and
 * exception flags for one employee for one pay period, applying the country's
 * overtime basis (daily vs weekly), rounding rule, and statutory daily/weekly caps.
 */
export function summarizeAttendance(country, records) {
  const c = getCountry(country);
  const rounding = c.overtime.rounding;
  let overtimeMinutes = 0, lateCount = 0, absentDays = 0, unpaidLeaveDays = 0, exceptions = [];
  const weeklyMinutesByWeek = {};

  for (const r of records) {
    if (r.status === 'absent') { absentDays++; continue; }
    if (r.status === 'leave' && r.leavePaid === false) { unpaidLeaveDays++; continue; }
    if (r.status === 'leave' || r.status === 'holiday' || r.status === 'weekend') continue;

    const worked = r.minutesWorked ?? 0;
    const standard = (c.workWeekHours / 6) * 60; // approx standard daily minutes (6-day or 5-day week both normalized here)
    const rawOt = Math.max(0, worked - standard);
    const roundedOt = roundMinutes(rawOt, rounding);

    if (c.overtime.dailyCap) {
      const capMin = c.overtime.dailyCap * 60;
      if (roundedOt > capMin) exceptions.push({ date: r.date, code: 'DAILY_OT_CAP', message: `${(roundedOt / 60).toFixed(1)}h overtime exceeds ${c.overtime.dailyCap}h daily cap` });
    }
    overtimeMinutes += c.overtime.basis === 'daily' ? Math.min(roundedOt, c.overtime.dailyCap ? c.overtime.dailyCap * 60 : Infinity) : roundedOt;

    if (c.overtime.basis === 'weekly') {
      const wk = r.isoWeek;
      weeklyMinutesByWeek[wk] = (weeklyMinutesByWeek[wk] ?? 0) + worked;
    }
    if (r.lateMinutes > 0) lateCount++;
  }

  if (c.overtime.basis === 'weekly') {
    overtimeMinutes = 0;
    for (const total of Object.values(weeklyMinutesByWeek)) {
      const thresholdMin = c.overtime.threshold * 60;
      overtimeMinutes += Math.max(0, total - thresholdMin);
    }
  }

  return {
    overtimeHours: round(overtimeMinutes / 60, 2),
    lateCount, absentDays, unpaidLeaveDays, exceptions,
    daysRecorded: records.filter((r) => !['weekend', 'holiday'].includes(r.status)).length,
  };
}

/** Compute an employee's current leave balance for a leave type given accrual-to-date and usage. */
export function leaveBalance(country, emp, leaveType, taken = 0, asOf = new Date()) {
  const c = getCountry(country);
  const policy = c.leave?.[leaveType];
  if (!policy) return null;
  const start = new Date(emp.hireDate);
  const monthsWorked = Math.max(0, (asOf - start) / (30.44 * 24 * 3600 * 1000));
  let annualEntitlement = policy.accrualDaysPerYear ?? policy.daysPerYear ?? 0;
  if (policy.tiers) {
    const years = monthsWorked / 12;
    for (const t of policy.tiers) if (t.afterYears && years >= t.afterYears) annualEntitlement = t.daysPerYear ?? annualEntitlement;
  }
  const accrued = policy.accrualMethod === 'monthly' ? round((annualEntitlement / 12) * monthsWorked, 1)
    : policy.accrualMethod === 'per-pay-period' ? round((annualEntitlement / 26) * (monthsWorked * 26 / 12), 1)
    : annualEntitlement;
  const capped = policy.carryoverCapDays ? Math.min(accrued, annualEntitlement + policy.carryoverCapDays) : accrued;
  return { leaveType, annualEntitlement, accrued: round(capped, 1), taken, balance: round(capped - taken, 1) };
}
