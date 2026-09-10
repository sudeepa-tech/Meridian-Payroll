import { store, getCountry, convert, round } from '../../core/index.js';
import { FX_RATES } from '../../config/countries.js';
import { calculateEmployee } from '../payroll/engine.js';

const rates = () => store.state.settings?.fxRates ?? FX_RATES;
const reporting = () => store.state.settings?.reportingCurrency ?? 'USD';

/* ---------- Statistics helpers ---------- */
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const stdev = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
function linearForecast(series, steps) {
  const n = series.length; if (n < 2) return Array(steps).fill(series[0] ?? 0);
  const xs = series.map((_, i) => i), xm = mean(xs), ym = mean(series);
  const slope = xs.reduce((s, x, i) => s + (x - xm) * (series[i] - ym), 0) / xs.reduce((s, x) => s + (x - xm) ** 2, 0);
  const intercept = ym - slope * xm;
  const resid = stdev(series.map((y, i) => y - (intercept + slope * i)));
  return Array.from({ length: steps }, (_, k) => { const v = intercept + slope * (n + k); return { value: round(v, 2), low: round(v - 1.64 * resid, 2), high: round(v + 1.64 * resid, 2) }; });
}

/* ---------- 1. Anomaly detection on a pay-run preview ---------- */
export function detectAnomalies(results) {
  const byEmp = {};
  for (const h of store.state.history) (byEmp[h.employeeId] ??= []).push(h.net);
  const anomalies = [];
  for (const r of results) {
    const hist = byEmp[r.employeeId] ?? [];
    const m = mean(hist), sd = stdev(hist) || m * 0.05 || 1;
    const z = hist.length ? (r.net - m) / sd : 0;
    const pct = m ? (r.net - m) / m : 0;
    if (Math.abs(z) > 2.5 && Math.abs(pct) > 0.15) {
      anomalies.push({ employeeId: r.employeeId, name: r.name, country: r.country, currency: r.currency, kind: 'statistical', score: round(Math.min(1, Math.abs(z) / 5), 2),
        title: `${pct > 0 ? 'Unusually high' : 'Unusually low'} net pay`,
        detail: `Net ${r.net.toLocaleString()} is ${(pct * 100).toFixed(0)}% ${pct > 0 ? 'above' : 'below'} the 8-month average of ${round(m, 0).toLocaleString()} (z = ${z.toFixed(1)})`,
        suggestion: pct > 0 ? 'Confirm the bonus or overtime entry before approving.' : 'Check for unintended unpaid days or a missing allowance.' });
    }
    if (r.earnings.overtimeHours > 40) anomalies.push({ employeeId: r.employeeId, name: r.name, country: r.country, kind: 'policy', score: 0.7, title: 'Heavy overtime', detail: `${r.earnings.overtimeHours} overtime hours this period`, suggestion: 'Verify timesheet approval and legal daily caps.' });
    for (const w of r.warnings) anomalies.push({ employeeId: r.employeeId, name: r.name, country: r.country, kind: 'compliance', score: w.severity === 'high' ? 0.9 : 0.5, title: w.code.replace('_', ' '), detail: w.message, suggestion: 'Resolve before submitting the pay run.' });
  }
  return anomalies.sort((a, b) => b.score - a.score);
}

/* ---------- 2. Duplicate / ghost-employee heuristics ---------- */
export function integrityChecks(employees) {
  const flags = [];
  const seenIban = {};
  for (const e of employees) {
    if (e.iban && e.country !== 'US') { (seenIban[e.iban] ??= []).push(e); }
  }
  for (const [iban, list] of Object.entries(seenIban)) if (list.length > 3)
    flags.push({ kind: 'integrity', score: 0.6, title: 'Shared bank account', detail: `${list.length} employees share IBAN ending ${iban.slice(-4)}`, suggestion: 'Confirm these are legitimate (sample data uses shared test IBANs).', employeeIds: list.map((x) => x.id) });
  const names = {};
  for (const e of employees) (names[e.name.toLowerCase()] ??= []).push(e.id);
  for (const [n, ids] of Object.entries(names)) if (ids.length > 1) flags.push({ kind: 'integrity', score: 0.4, title: 'Duplicate name', detail: `"${n}" appears ${ids.length} times`, suggestion: 'Check for a duplicated record.', employeeIds: ids });
  return flags;
}

/* ---------- 3. Cost forecast in reporting currency ---------- */
export function forecast(months = 6) {
  const byPeriod = {};
  for (const h of store.state.history) byPeriod[h.period] = (byPeriod[h.period] ?? 0) + convert(h.employerCost, h.currency, reporting(), rates());
  const periods = Object.keys(byPeriod).sort();
  const series = periods.map((p) => round(byPeriod[p], 2));
  const f = linearForecast(series, months);
  const last = new Date(periods.at(-1) + '-01');
  const future = f.map((v, i) => { const d = new Date(last); d.setMonth(d.getMonth() + i + 1); return { period: d.toISOString().slice(0, 7), ...v, forecast: true }; });
  const growth = series.length > 1 ? (series.at(-1) - series[0]) / series[0] : 0;
  return { currency: reporting(), actual: periods.map((p, i) => ({ period: p, value: series[i] })), forecast: future,
    narrative: `Employer cost has moved ${(growth * 100).toFixed(1)}% since ${periods[0]}. Trend projects ${future.at(-1).value.toLocaleString()} ${reporting()} by ${future.at(-1).period} (90% band ${future.at(-1).low.toLocaleString()}–${future.at(-1).high.toLocaleString()}).` };
}

/* ---------- 4. Compliance risk score per country ---------- */
export function riskScores() {
  const out = [];
  const byCountry = {};
  for (const e of store.state.employees.filter((x) => x.status === 'active')) (byCountry[e.country] ??= []).push(e);
  for (const [code, emps] of Object.entries(byCountry)) {
    const c = getCountry(code);
    const issues = [];
    const missingIban = emps.filter((e) => !e.iban).length;
    if (c.wageProtection?.required && missingIban) issues.push({ label: `${missingIban} employee(s) missing IBAN for ${c.wageProtection.system}`, weight: 30 });
    const nationals = emps.filter((e) => e.nationality === code).length;
    const ratio = nationals / emps.length;
    if (['SA', 'OM', 'BH', 'AE', 'QA', 'KW'].includes(code) && ratio < 0.2) issues.push({ label: `Nationalisation ratio ${(ratio * 100).toFixed(0)}% — below typical quota band`, weight: 20 });
    const lowPay = emps.filter((e) => c.minimumWage?.amount && c.minimumWage.unit === 'month' && e.basicSalary < c.minimumWage.amount && (code !== 'SA' || e.nationality === 'SA')).length;
    if (lowPay) issues.push({ label: `${lowPay} employee(s) below minimum wage`, weight: 40 });
    if (c.incomeTax?.scheduled) issues.push({ label: `Scheduled change: ${c.incomeTax.note}`, weight: 5 });
    const score = Math.max(0, 100 - issues.reduce((s, i) => s + i.weight, 0));
    out.push({ country: code, name: c.name, headcount: emps.length, nationals, score, grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 50 ? 'C' : 'D', issues });
  }
  return out.sort((a, b) => a.score - b.score);
}

/* ---------- 5. Assistant ---------- */
function buildContext() {
  const emps = store.state.employees.filter((e) => e.status === 'active');
  const results = emps.map((e) => calculateEmployee(e));
  const rc = reporting();
  const byCountry = {};
  for (const r of results) {
    const b = (byCountry[r.country] ??= { headcount: 0, gross: 0, net: 0, employerCost: 0, currency: r.currency });
    b.headcount++; b.gross += r.earnings.gross; b.net += r.net; b.employerCost += r.employer.totalCost;
  }
  const totalCost = results.reduce((s, r) => s + convert(r.employer.totalCost, r.currency, rc, rates()), 0);
  return { emps, results, byCountry, totalCost, rc, anomalies: detectAnomalies(results), risks: riskScores() };
}

function localAnswer(q, ctx) {
  const t = q.toLowerCase();
  const fmt = (n, c) => `${round(n, 2).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${c}`;
  if (/(total|overall).*(cost|payroll)|how much.*(cost|payroll)/.test(t))
    return `Total employer cost for the current period across ${ctx.emps.length} active employees is about ${fmt(ctx.totalCost, ctx.rc)}. ` + Object.entries(ctx.byCountry).map(([c, b]) => `${c}: ${fmt(b.employerCost, b.currency)} for ${b.headcount} people`).join('; ') + '.';
  if (/anomal|unusual|flag|suspicious/.test(t))
    return ctx.anomalies.length ? `I found ${ctx.anomalies.length} items to review. Top ones: ` + ctx.anomalies.slice(0, 4).map((a) => `${a.name} (${a.country}) — ${a.title}: ${a.detail}`).join('; ') + '.' : 'No anomalies detected in the current preview.';
  if (/risk|complian|regulat|rule/.test(t))
    return ctx.risks.map((r) => `${r.name}: score ${r.score} (${r.grade})${r.issues.length ? ' — ' + r.issues.map((i) => i.label).join('; ') : ' — no open issues'}`).join('. ') + '.';
  if (/gratuity|end.of.service|eosb|indemnity/.test(t)) {
    const rows = ctx.results.filter((r) => r.endOfService.enabled !== false && r.endOfService.accruedTotal > 0);
    const total = {};
    for (const r of rows) total[r.currency] = (total[r.currency] ?? 0) + r.endOfService.accruedTotal;
    return `Accrued end-of-service liability if everyone left today: ` + Object.entries(total).map(([c, v]) => fmt(v, c)).join(', ') + `. ${rows.length} employees are accruing.`;
  }
  if (/tax/.test(t)) {
    const us = ctx.results.filter((r) => r.country === 'US');
    const tax = us.reduce((s, r) => s + r.deductions.incomeTax + r.deductions.stateTax, 0);
    return `Only the US entity withholds income tax in this configuration: ${fmt(tax, 'USD')} federal + state per biweekly period for ${us.length} employees. GCC entities have no personal income tax; Oman's 5% tax on income above OMR 42,000 is scheduled for 2028 and already modelled in the engine.`;
  }
  if (/headcount|how many|employees/.test(t))
    return `${ctx.emps.length} active employees: ` + Object.entries(ctx.byCountry).map(([c, b]) => `${b.headcount} in ${c}`).join(', ') + '.';
  const m = t.match(/(?:for|of|about)\s+([a-z' ]+?)(?:\?|$)/);
  if (m) {
    const e = ctx.results.find((r) => r.name.toLowerCase().includes(m[1].trim()));
    if (e) return `${e.name} (${e.country}): gross ${fmt(e.earnings.gross, e.currency)}, deductions ${fmt(e.deductions.total, e.currency)}, net ${fmt(e.net, e.currency)} per ${e.payFrequency} period. Employer cost ${fmt(e.employer.totalCost, e.currency)}.${e.warnings.length ? ' Warnings: ' + e.warnings.map((w) => w.message).join('; ') : ''}`;
  }
  return `I can answer questions about total cost, anomalies, compliance risk, gratuity liability, taxes, headcount, or a specific employee ("what is the net pay for Amira"). Running in local mode — set ANTHROPIC_API_KEY on the server for open-ended questions.`;
}

export async function ask(question) {
  const ctx = buildContext();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { answer: localAnswer(question, ctx), provider: 'local' };
  const summary = {
    reportingCurrency: ctx.rc, totalEmployerCost: round(ctx.totalCost, 2), byCountry: ctx.byCountry,
    anomalies: ctx.anomalies.slice(0, 15), risks: ctx.risks,
    employees: ctx.results.map((r) => ({ id: r.employeeId, name: r.name, country: r.country, gross: r.earnings.gross, net: r.net, currency: r.currency, warnings: r.warnings.map((w) => w.code) })),
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', max_tokens: 800,
      system: 'You are the payroll analyst for Meridian Holdings. Answer concisely using only the JSON context. Currency amounts must state the currency. Never invent employees or figures.',
      messages: [{ role: 'user', content: `Context:\n${JSON.stringify(summary)}\n\nQuestion: ${question}` }] }),
  });
  if (!res.ok) return { answer: localAnswer(question, ctx), provider: 'local', note: `Claude API error ${res.status}; fell back to local mode` };
  const data = await res.json();
  return { answer: data.content?.filter((c) => c.type === 'text').map((c) => c.text).join('\n') ?? '', provider: 'anthropic' };
}
