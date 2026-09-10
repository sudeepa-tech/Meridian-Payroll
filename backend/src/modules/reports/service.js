import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { convert, round } from '../../core/index.js';

const BRAND = '#17603f';

function streamToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/* ---------- PDF: Payroll summary ---------- */
export async function payrollSummaryPdf(preview, settings) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  doc.fillColor(BRAND).fontSize(20).text(settings.companyName, { continued: false });
  doc.fillColor('#4c5a53').fontSize(11).text(`Payroll summary — ${preview.period} — ${preview.country === 'ALL' ? 'All entities' : preview.country}`);
  doc.moveDown(1);
  doc.strokeColor('#dfe5e0').moveTo(48, doc.y).lineTo(547, doc.y).stroke();
  doc.moveDown(1);

  doc.fillColor('#17211d').fontSize(13).text('Consolidated totals', { underline: false });
  doc.moveDown(0.4);
  const rows = [
    ['Reporting currency', preview.consolidated.currency],
    ['Gross pay', preview.consolidated.gross.toLocaleString(undefined, { maximumFractionDigits: 0 })],
    ['Net pay', preview.consolidated.net.toLocaleString(undefined, { maximumFractionDigits: 0 })],
    ['Employer cost', preview.consolidated.employerCost.toLocaleString(undefined, { maximumFractionDigits: 0 })],
    ['Headcount', preview.results.length],
    ['Open AI flags', preview.anomalies.length],
  ];
  doc.fontSize(10).fillColor('#4c5a53');
  for (const [k, v] of rows) { doc.text(`${k}:`, 48, doc.y, { continued: true, width: 200 }); doc.fillColor('#17211d').text(`  ${v}`, { continued: false }); doc.fillColor('#4c5a53'); doc.moveDown(0.15); }

  doc.moveDown(1);
  doc.fillColor('#17211d').fontSize(13).text('By entity');
  doc.moveDown(0.4);
  const tableTop = doc.y;
  const cols = [48, 140, 230, 330, 430];
  const headers = ['Country', 'Currency', 'Headcount', 'Employer cost', 'Net pay'];
  doc.fontSize(9).fillColor('#8a968f');
  headers.forEach((h, i) => doc.text(h, cols[i], tableTop, { width: (cols[i + 1] ?? 547) - cols[i] - 6 }));
  let y = tableTop + 16;
  doc.fontSize(10).fillColor('#17211d');
  for (const t of preview.totals) {
    doc.text(t.currency, cols[0], y);
    doc.text(t.currency, cols[1], y);
    doc.text(String(t.headcount), cols[2], y);
    doc.text(t.employerCost.toLocaleString(undefined, { maximumFractionDigits: 0 }), cols[3], y);
    doc.text(t.net.toLocaleString(undefined, { maximumFractionDigits: 0 }), cols[4], y);
    y += 18;
  }
  doc.moveTo(48, y + 4).lineTo(547, y + 4).strokeColor('#dfe5e0').stroke();

  if (preview.anomalies.length) {
    doc.moveDown(2);
    doc.fillColor('#17211d').fontSize(13).text('AI-flagged items');
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor('#4c5a53');
    for (const a of preview.anomalies.slice(0, 20)) {
      doc.fillColor(a.kind === 'compliance' ? '#b23a2c' : '#17211d').text(`• ${a.title} — ${a.name} (${a.country}): `, { continued: true });
      doc.fillColor('#4c5a53').text(a.detail);
    }
  }

  doc.moveDown(2);
  doc.fontSize(8).fillColor('#8a968f').text(`Generated ${new Date().toLocaleString()} · Meridian Payroll · Tax and social security figures require verification against current statutes.`, { width: 500 });

  return streamToBuffer(doc);
}

/* ---------- PDF: Compliance risk report ---------- */
export async function complianceRiskPdf(risks, settings) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  doc.fillColor(BRAND).fontSize(20).text(settings.companyName);
  doc.fillColor('#4c5a53').fontSize(11).text('Compliance risk report — all entities');
  doc.moveDown(1);
  doc.strokeColor('#dfe5e0').moveTo(48, doc.y).lineTo(547, doc.y).stroke();
  doc.moveDown(1);

  for (const r of risks) {
    doc.fillColor('#17211d').fontSize(13).text(`${r.name}  ·  Score ${r.score} (${r.grade})  ·  ${r.headcount} employees`);
    doc.moveDown(0.3);
    if (!r.issues.length) { doc.fontSize(10).fillColor('#4c5a53').text('No open issues.'); }
    else for (const i of r.issues) { doc.fontSize(10).fillColor('#b23a2c').text(`• ${i.label}`, { indent: 10 }); }
    doc.moveDown(1);
  }
  doc.fontSize(8).fillColor('#8a968f').text(`Generated ${new Date().toLocaleString()} · Meridian Payroll`, { width: 500 });
  return streamToBuffer(doc);
}

/* ---------- XLSX: Payroll register ---------- */
export async function payrollRegisterXlsx(preview) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Meridian Payroll';
  const ws = wb.addWorksheet('Payroll register');
  ws.columns = [
    { header: 'Employee ID', key: 'id', width: 12 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Country', key: 'country', width: 10 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Basic', key: 'basic', width: 12 },
    { header: 'Allowances', key: 'allow', width: 12 },
    { header: 'Overtime', key: 'ot', width: 12 },
    { header: 'Bonus', key: 'bonus', width: 12 },
    { header: 'Gross', key: 'gross', width: 14 },
    { header: 'Employee deductions', key: 'ded', width: 16 },
    { header: 'Income tax', key: 'tax', width: 12 },
    { header: 'Net pay', key: 'net', width: 14 },
    { header: 'Employer contributions', key: 'erContrib', width: 18 },
    { header: 'Employer cost', key: 'erCost', width: 16 },
    { header: 'Warnings', key: 'warnings', width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17603F' } };
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  for (const r of preview.results) {
    ws.addRow({
      id: r.employeeId, name: r.name, country: r.country, currency: r.currency,
      basic: r.earnings.basic, allow: r.earnings.allowances, ot: r.earnings.overtime, bonus: r.earnings.bonus,
      gross: r.earnings.gross, ded: r.deductions.employeeContributions.reduce((s, l) => s + l.amount, 0),
      tax: r.deductions.incomeTax + r.deductions.stateTax, net: r.net,
      erContrib: r.employer.total, erCost: r.employer.totalCost,
      warnings: r.warnings.map((w) => w.message).join('; '),
    });
  }
  ws.autoFilter = { from: 'A1', to: 'O1' };
  for (const col of ['basic', 'allow', 'ot', 'bonus', 'gross', 'ded', 'tax', 'net', 'erContrib', 'erCost']) {
    ws.getColumn(col).numFmt = '#,##0.00';
  }

  const summary = wb.addWorksheet('Summary by entity');
  summary.columns = [{ header: 'Country', key: 'c', width: 12 }, { header: 'Currency', key: 'cur', width: 10 }, { header: 'Headcount', key: 'h', width: 12 }, { header: 'Gross', key: 'g', width: 14 }, { header: 'Net', key: 'n', width: 14 }, { header: 'Employer cost', key: 'e', width: 16 }];
  summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17603F' } };
  for (const t of preview.totals) summary.addRow({ c: '', cur: t.currency, h: t.headcount, g: t.gross, n: t.net, e: t.employerCost });
  for (const col of ['g', 'n', 'e']) summary.getColumn(col).numFmt = '#,##0.00';

  return wb.xlsx.writeBuffer();
}

/* ---------- XLSX: Cost by country over time ---------- */
export async function costByCountryXlsx(history, settings, fxRates) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Monthly cost by country');
  const countries = [...new Set(history.map((h) => h.country))];
  ws.columns = [{ header: 'Period', key: 'period', width: 12 }, ...countries.map((c) => ({ header: c, key: c, width: 14 })), { header: `Total (${settings.reportingCurrency})`, key: 'total', width: 18 }];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17603F' } };

  const byPeriod = {};
  for (const h of history) {
    const row = (byPeriod[h.period] ??= { period: h.period });
    row[h.country] = round((row[h.country] ?? 0) + h.employerCost, 2);
  }
  for (const period of Object.keys(byPeriod).sort()) {
    const row = byPeriod[period];
    let total = 0;
    for (const c of countries) if (row[c]) total += convert(row[c], c, settings.reportingCurrency, fxRates);
    ws.addRow({ ...row, total: round(total, 2) });
  }
  for (const c of countries) ws.getColumn(c).numFmt = '#,##0.00';
  ws.getColumn('total').numFmt = '#,##0.00';
  return wb.xlsx.writeBuffer();
}
