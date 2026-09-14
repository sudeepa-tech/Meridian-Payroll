import { store, convert, round } from '../../core/index.js';
import { FX_RATES } from '../../config/countries.js';
import { calculateEmployee } from '../payroll/engine.js';
import { summarizeAttendance } from '../attendance/engine.js';
import { detectAnomalies, forecast as costForecast, riskScores } from './service.js';

const rates = () => store.state.settings?.fxRates ?? FX_RATES;
const rc = () => store.state.settings?.reportingCurrency ?? 'USD';
const money = (n, c = rc()) => `${round(n, 0).toLocaleString()} ${c}`;

function currentResults() {
  const emps = store.state.employees.filter((e) => e.status === 'active');
  return emps.map((e) => calculateEmployee(e));
}

function sectionCost(results) {
  const byCountry = {};
  let total = 0;
  for (const r of results) {
    const b = (byCountry[r.country] ??= { country: r.country, headcount: 0, cost: 0, currency: r.currency });
    b.headcount++; b.cost += r.employer.totalCost;
    total += convert(r.employer.totalCost, r.currency, rc(), rates());
  }
  const sorted = Object.values(byCountry).sort((a, b) => convert(b.cost, b.currency, rc(), rates()) - convert(a.cost, a.currency, rc(), rates()));
  const rows = sorted.map((b) => [b.country, b.headcount, money(b.cost, b.currency), money(convert(b.cost, b.currency, rc(), rates()))]);
  const top = sorted[0];
  const topShare = top ? round((convert(top.cost, top.currency, rc(), rates()) / total) * 100) : 0;
  return {
    heading: 'Total payroll cost',
    narrative: `Total employer cost across ${results.length} active employees this cycle is ${money(total)}. ${top ? `${top.country} is the single largest cost center at ${money(convert(top.cost, top.currency, rc(), rates()))} (${topShare}% of total spend).` : ''} This figure includes gross pay, statutory employer contributions, and accrued end-of-service liability where applicable — it is the true loaded cost of the workforce, not just salaries.`,
    metrics: [{ label: 'Total employer cost', value: money(total) }, { label: 'Active headcount', value: String(results.length) }, { label: 'Avg. cost per employee', value: money(total / (results.length || 1)) }],
    table: { headers: ['Country', 'Headcount', 'Local cost', `${rc()} equivalent`], rows },
  };
}

function sectionOvertime() {
  const period = '2026-09';
  const recs = store.state.attendance.filter((a) => a.period === period);
  let totalHours = 0, totalExceptions = 0;
  const byCountry = {};
  for (const a of recs) {
    const s = summarizeAttendance(a.country, a.records);
    totalHours += s.overtimeHours; totalExceptions += s.exceptions.length;
    const b = (byCountry[a.country] ??= { country: a.country, hours: 0, exceptions: 0, headcount: 0 });
    b.hours += s.overtimeHours; b.exceptions += s.exceptions.length; b.headcount++;
  }
  const list = Object.values(byCountry);
  const rows = list.sort((a, b) => b.hours - a.hours).map((b) => [b.country, b.headcount, round(b.hours, 1), b.exceptions]);
  const worst = [...list].sort((a, b) => b.exceptions - a.exceptions)[0];
  return {
    heading: 'Overtime exposure',
    narrative: `${round(totalHours, 0)} overtime hours were logged across all entities this cycle, generating ${totalExceptions} statutory cap exceptions requiring review. ${worst && worst.exceptions > 0 ? `${worst.country} accounts for the largest share of exceptions (${worst.exceptions}), driven by the region's daily overtime ceiling — worth a targeted staffing or scheduling review if this persists into next cycle.` : 'No entity shows a concerning concentration of exceptions this cycle.'}`,
    metrics: [{ label: 'Total overtime hours', value: round(totalHours, 0) }, { label: 'Policy exceptions', value: totalExceptions }],
    table: { headers: ['Country', 'Employees', 'OT hours', 'Exceptions'], rows },
  };
}

function sectionCompliance() {
  const risks = riskScores();
  const worst = risks[0];
  const rows = risks.map((r) => [r.name, r.score, r.grade, r.issues.map((i) => i.label).join('; ') || 'None']);
  return {
    heading: 'Compliance risk posture',
    narrative: `${risks.filter((r) => r.grade === 'A').length} of ${risks.length} entities carry an A-grade compliance score with no open issues. ${worst && worst.score < 90 ? `${worst.name} is the entity requiring the most attention, scoring ${worst.score}/100 — primarily due to ${(worst.issues[0]?.label ?? '').toLowerCase() || 'open items'}. These are typically resolvable within a single payroll cycle once flagged.` : 'No entity currently falls below an A-grade score.'}`,
    metrics: risks.map((r) => ({ label: r.name, value: `${r.score}/100 (${r.grade})` })),
    table: { headers: ['Entity', 'Score', 'Grade', 'Open issues'], rows },
  };
}

function sectionHeadcount(results) {
  const byDept = {};
  for (const r of results) { const emp = store.state.employees.find((e) => e.id === r.employeeId); const d = emp?.department ?? 'Unknown'; byDept[d] = (byDept[d] ?? 0) + 1; }
  const byCountry = {};
  for (const r of results) byCountry[r.country] = (byCountry[r.country] ?? 0) + 1;
  const deptSorted = Object.entries(byDept).sort((a, b) => b[1] - a[1]);
  const rows = deptSorted.map(([d, n]) => [d, n, `${round((n / results.length) * 100)}%`]);
  return {
    heading: 'Workforce composition',
    narrative: `The organization employs ${results.length} active people across ${Object.keys(byCountry).length} countries. ${deptSorted[0]?.[0] ?? 'No department data'} is the largest function by headcount. Distribution is ${Object.keys(byCountry).length > 4 ? 'meaningfully international' : 'concentrated in a small number of markets'}, which shapes both compliance surface area and currency exposure in the cost figures above.`,
    metrics: [{ label: 'Total headcount', value: results.length }, { label: 'Countries', value: Object.keys(byCountry).length }, { label: 'Departments', value: Object.keys(byDept).length }],
    table: { headers: ['Department', 'Headcount', 'Share'], rows },
  };
}

function sectionForecast() {
  const f = costForecast(6);
  const last = f.forecast.at(-1);
  const first = f.actual[0]?.value ?? 0;
  const growth = first ? round(((last.value - first) / first) * 100, 1) : 0;
  return {
    heading: 'Cost trajectory & forecast',
    narrative: `${f.narrative} Viewed over the full trailing and projected window, employer cost has moved ${growth >= 0 ? 'up' : 'down'} ${Math.abs(growth)}% — ${Math.abs(growth) < 5 ? 'a stable trend that supports predictable budget planning' : 'a trend worth flagging to finance leadership for budget re-forecasting'}.`,
    metrics: [{ label: `Projected cost, ${last.period}`, value: money(last.value) }, { label: '90% confidence band', value: `${money(last.low)} – ${money(last.high)}` }],
    table: { headers: ['Period', `Cost (${f.currency})`, 'Type'], rows: [...f.actual.map((a) => [a.period, round(a.value, 0).toLocaleString(), 'Actual']), ...f.forecast.map((a) => [a.period, round(a.value, 0).toLocaleString(), 'Forecast'])] },
  };
}

function sectionAnomalies(results) {
  const anomalies = detectAnomalies(results);
  const rows = anomalies.slice(0, 15).map((a) => [a.name, a.country, a.kind, a.title, a.detail]);
  return {
    heading: 'AI-flagged anomalies this cycle',
    narrative: anomalies.length ? `${anomalies.length} items were flagged by the anomaly detector this cycle, spanning statistical pay outliers, compliance warnings, and policy exceptions. These are surfaced for review before final approval — most resolve to a legitimate one-off (a bonus, a new hire's partial period) rather than an error, but each is worth a human glance.` : 'No anomalies were flagged this cycle across any active employee — a clean run.',
    metrics: [{ label: 'Total flagged', value: anomalies.length }, { label: 'Compliance-severity', value: anomalies.filter((a) => a.kind === 'compliance').length }],
    table: { headers: ['Employee', 'Country', 'Kind', 'Issue', 'Detail'], rows },
  };
}

function sectionGratuity(results) {
  const totals = {};
  for (const r of results) if (r.endOfService?.accruedTotal > 0) totals[r.currency] = (totals[r.currency] ?? 0) + r.endOfService.accruedTotal;
  const totalReporting = Object.entries(totals).reduce((s, [c, v]) => s + convert(v, c, rc(), rates()), 0);
  return {
    heading: 'End-of-service liability',
    narrative: `Accrued end-of-service gratuity liability — the amount owed if every eligible employee left today — totals approximately ${money(totalReporting)} across all Gulf entities. This is a real balance-sheet liability that grows monthly and should be reconciled against any funded provision on the finance ledger.`,
    metrics: [{ label: 'Total accrued liability', value: money(totalReporting) }],
    table: { headers: ['Currency', 'Accrued amount'], rows: Object.entries(totals).map(([c, v]) => [c, round(v, 0).toLocaleString()]) },
  };
}

const TOPIC_BUILDERS = [
  { keys: ['cost', 'spend', 'budget', 'expense'], build: (r) => sectionCost(r) },
  { keys: ['overtime', 'ot ', 'hours'], build: () => sectionOvertime() },
  { keys: ['complian', 'risk', 'regulat', 'legal'], build: () => sectionCompliance() },
  { keys: ['headcount', 'workforce', 'employee', 'staff', 'department'], build: (r) => sectionHeadcount(r) },
  { keys: ['forecast', 'trend', 'project', 'trajectory'], build: () => sectionForecast() },
  { keys: ['anomal', 'flag', 'outlier', 'exception', 'audit'], build: (r) => sectionAnomalies(r) },
  { keys: ['gratuity', 'end of service', 'eosb', 'liability', 'indemnity'], build: (r) => sectionGratuity(r) },
];

function localGenerateReport(prompt) {
  const p = prompt.toLowerCase();
  const results = currentResults();
  const matched = TOPIC_BUILDERS.filter((t) => t.keys.some((k) => p.includes(k)));
  const sections = (matched.length ? matched : TOPIC_BUILDERS.slice(0, 4)).map((t) => t.build(results));
  const title = matched.length ? `${sections.map((s) => s.heading).join(' & ')} — Executive Report` : 'Payroll Health Overview — Executive Report';
  const totalCost = results.reduce((s, r) => s + convert(r.employer.totalCost, r.currency, rc(), rates()), 0);
  const risks = riskScores();
  const summary = `Prepared for senior leadership: ${results.length} active employees across ${new Set(results.map((r) => r.country)).size} countries, total employer cost of ${money(totalCost)} this cycle. ${risks.filter((r) => r.grade !== 'A').length} of ${risks.length} entities carry an open compliance item. Details follow by topic below, each grounded in this cycle's live payroll data.`;
  return { title, executiveSummary: summary, sections };
}

export async function generateReport(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const results = currentResults();
      const digest = { reportingCurrency: rc(), headcount: results.length, byCountry: sectionCost(results).table, risks: riskScores(), forecast: costForecast(6).narrative, anomalyCount: detectAnomalies(results).length };
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', max_tokens: 2500,
          system: 'You write concise executive payroll reports for senior (C-suite/VP) management. Respond with ONLY valid JSON matching this shape, no prose outside the JSON: { "title": string, "executiveSummary": string, "sections": [{ "heading": string, "narrative": string, "metrics": [{"label":string,"value":string}], "table": {"headers":string[], "rows": string[][]} }] }. Ground every number in the provided data digest — never invent figures. Write in a direct, confident executive tone: short sentences, specific numbers, one clear "so what" per section.',
          messages: [{ role: 'user', content: `Data digest:\n${JSON.stringify(digest)}\n\nRequest: ${prompt}` }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const raw = data.content?.filter((c) => c.type === 'text').map((c) => c.text).join('') ?? '';
        const cleaned = raw.trim().replace(/^```json\n?/, '').replace(/```$/, '');
        const parsed = JSON.parse(cleaned);
        if (parsed.title && parsed.sections) return { content: parsed, provider: 'anthropic' };
      }
    } catch { /* fall through to local */ }
  }
  return { content: localGenerateReport(prompt), provider: 'local' };
}
