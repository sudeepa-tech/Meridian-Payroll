import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEmployee } from '../src/modules/payroll/engine.js';

test('US biweekly withholds federal tax and FICA', () => {
  const r = calculateEmployee({ id: 'T1', name: 'Test', country: 'US', nationality: 'US', state: 'TX', basicSalary: 10000, hireDate: '2022-01-01', allowances: [], iban: 'x' });
  assert.equal(r.earnings.gross, 4615.38);
  assert.ok(r.deductions.incomeTax > 0);
  assert.equal(r.deductions.stateTax, 0);
  assert.equal(r.deductions.employeeContributions.length, 3);
});
test('UAE expat pays no tax or pension and accrues 21-day gratuity', () => {
  const r = calculateEmployee({ id: 'T2', name: 'Test', country: 'AE', nationality: 'IN', basicSalary: 12000, hireDate: '2023-09-01', allowances: [{ type: 'Housing', amount: 3000 }], iban: 'AE1' });
  assert.equal(r.deductions.total, 0);
  assert.equal(r.net, 15000);
  assert.equal(r.employer.endOfServiceAccrual, 700); // 21 days × 400/day ÷ 12
});
test('Saudi national has GOSI on both sides', () => {
  const r = calculateEmployee({ id: 'T3', name: 'Test', country: 'SA', nationality: 'SA', basicSalary: 10000, hireDate: '2020-01-01', allowances: [], iban: 'SA1' });
  assert.equal(r.deductions.total, 975);
  assert.equal(r.employer.total, 1175);
});
test('missing IBAN raises a WPS warning', () => {
  const r = calculateEmployee({ id: 'T4', name: 'Test', country: 'QA', nationality: 'NP', basicSalary: 3000, hireDate: '2024-01-01', allowances: [], iban: null });
  assert.ok(r.warnings.some((w) => w.code === 'WPS_IBAN'));
});
