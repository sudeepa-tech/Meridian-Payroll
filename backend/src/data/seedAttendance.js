import { store } from '../core/index.js';
import { getCountry } from '../core/index.js';

let s = 77341;
const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647;

const LEAVE_TYPES = ['annual', 'sick', 'unpaid'];
const LEAVE_STATUS_WEIGHTS = [['approved', 0.7], ['pending', 0.2], ['rejected', 0.1]];
function weightedPick(pairs) { const r = rnd(); let acc = 0; for (const [v, w] of pairs) { acc += w; if (r <= acc) return v; } return pairs.at(-1)[0]; }

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - yearStart) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

function generateAttendanceForEmployee(emp, year, month) {
  const c = getCountry(emp.country);
  const weekend = c.weekend; // e.g. ['Sat','Sun'] or ['Fri','Sat']
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const daysInMonth = new Date(year, month, 0).getDate();
  const standardMinutes = (c.workWeekHours / 6) * 60;
  const records = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dow = dayNames[date.getDay()];
    const iso = date.toISOString().slice(0, 10);
    if (weekend.includes(dow)) { records.push({ date: iso, status: 'weekend', isoWeek: isoWeek(date) }); continue; }

    const roll = rnd();
    if (roll < 0.02) { records.push({ date: iso, status: 'absent', isoWeek: isoWeek(date), minutesWorked: 0 }); continue; }
    if (roll < 0.06) { records.push({ date: iso, status: 'leave', leavePaid: rnd() < 0.85, isoWeek: isoWeek(date), minutesWorked: 0 }); continue; }

    const lateMinutes = rnd() < 0.12 ? Math.round(rnd() * 25) : 0;
    const otRoll = rnd();
    const extraMinutes = otRoll < 0.25 ? Math.round(rnd() * 150) : otRoll < 0.35 ? Math.round(150 + rnd() * 90) : 0;
    const clockInHour = 9, clockInMin = lateMinutes;
    const minutesWorked = Math.round(standardMinutes - lateMinutes + extraMinutes);
    const clockOutTotal = clockInHour * 60 + clockInMin + minutesWorked;
    records.push({
      date: iso, status: 'present', isoWeek: isoWeek(date),
      clockIn: `${String(clockInHour).padStart(2, '0')}:${String(clockInMin).padStart(2, '0')}`,
      clockOut: `${String(Math.floor(clockOutTotal / 60) % 24).padStart(2, '0')}:${String(clockOutTotal % 60).padStart(2, '0')}`,
      minutesWorked, lateMinutes,
    });
  }
  return records;
}

export function seedAttendanceIfEmpty() {
  if (store.state.attendance?.length) return;
  const employees = store.state.employees;
  const attendance = [];
  const leaveRequests = [];
  let leaveId = 1;

  for (const emp of employees) {
    // Current cycle attendance (Sept 2026) for the payroll-linked overtime calc
    const recs = generateAttendanceForEmployee(emp, 2026, 9);
    attendance.push({ employeeId: emp.id, country: emp.country, period: '2026-09', records: recs });

    // A handful of leave requests per employee across the year
    const requestCount = Math.floor(rnd() * 3);
    for (let i = 0; i < requestCount; i++) {
      const type = LEAVE_TYPES[Math.floor(rnd() * LEAVE_TYPES.length)];
      const month = 1 + Math.floor(rnd() * 8);
      const startDay = 1 + Math.floor(rnd() * 24);
      const span = 1 + Math.floor(rnd() * 4);
      const start = new Date(2026, month - 1, startDay);
      const end = new Date(2026, month - 1, startDay + span - 1);
      leaveRequests.push({
        id: `LR-${String(leaveId++).padStart(4, '0')}`,
        employeeId: emp.id, employeeName: emp.name, country: emp.country,
        type, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10),
        days: span, status: weightedPick(LEAVE_STATUS_WEIGHTS),
        reason: type === 'sick' ? 'Medical' : type === 'unpaid' ? 'Personal' : 'Vacation',
        requestedAt: new Date(2026, month - 1, Math.max(1, startDay - 7)).toISOString(),
      });
    }
  }

  store.state.attendance = attendance;
  store.state.leaveRequests = leaveRequests;
  store.audit('system', 'seed.attendance', { records: attendance.length, leaveRequests: leaveRequests.length });
  store.save();
}
