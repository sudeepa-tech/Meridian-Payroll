import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { calculateEmployee } from '../src/modules/payroll/engine.js';

/*
 * This is the "check the math still comes out right before it goes live" gate. Each fixture
 * below was computed once, hand-verified against the underlying statutory formula (see the
 * inline note per country), and locked in. If a future edit to config/countries.js or the
 * engine changes any of these numbers, this test fails loudly — that's the point. A failure
 * here means: stop, and have someone confirm whether the change was an intentional, reviewed
 * rule update (in which case regenerate the fixture and note who approved it) or an
 * accidental regression (in which case revert it) — before it ever reaches a real payroll run.
 *
 * The `reviewedBy` field in the fixture file is currently a placeholder. Wiring this to an
 * actual named reviewer with a date, per country, per quarter, is the process half of this
 * gate — the software can enforce that the numbers match a locked baseline, but only a
 * qualified person can confirm that baseline is legally correct in the first place.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'known-correct-payslips.json'), 'utf8'));

const TOLERANCE = 0.01; // one cent/fils — catches real drift without failing on float noise

function assertClose(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= TOLERANCE, `${label}: expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected).toFixed(4)})`);
}

for (const [code, fixture] of Object.entries(fixtures)) {
  if (code === '_meta') continue;
  test(`known-correct payslip: ${code} (${fixture.employee.nationality === code ? 'national' : 'expat'}, basic ${fixture.employee.basicSalary})`, () => {
    const r = calculateEmployee(fixture.employee);
    const employeeDeductions = r.deductions.employeeContributions.reduce((s, l) => s + l.amount, 0) + r.deductions.incomeTax + r.deductions.stateTax;
    assertClose(r.earnings.gross, fixture.expected.gross, 'gross');
    assertClose(employeeDeductions, fixture.expected.employeeDeductions, 'employeeDeductions');
    assertClose(r.net, fixture.expected.net, 'net');
    assertClose(r.employer.total, fixture.expected.employerContributions, 'employerContributions');
    assertClose(r.employer.totalCost, fixture.expected.employerCost, 'employerCost');
  });
}

test('fixture file carries review metadata (fails loudly if the placeholder is ever silently deleted)', () => {
  assert.ok(fixtures._meta, 'Fixture file must carry a _meta block documenting when and by whom it was reviewed');
  assert.ok(fixtures._meta.reviewedBy, 'Every fixture set must name a reviewer before use in production, even if the current value is an explicit UNREVIEWED placeholder');
});
