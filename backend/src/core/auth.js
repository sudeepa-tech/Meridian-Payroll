import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, countUsers } from './db.js';
import { unauthorized, forbidden } from './index.js';

/*
 * SECURITY NOTE (read before deploying this anywhere real):
 * - JWT_SECRET falls back to a generated-at-boot random value, which means every restart
 *   invalidates all sessions. Set a real JWT_SECRET env var for anything persistent.
 * - Demo users are seeded with simple published passwords so reviewers can log in. Rotate
 *   or delete them before this touches real payroll data.
 * - There's no password-reset flow, no MFA, no session revocation list, no rate limiting on
 *   the login endpoint beyond the global limiter, and no refresh-token rotation. This is a
 *   correct-shape RBAC implementation for a prototype, not a hardened auth system.
 */
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL = '8h';

export const ROLES = {
  admin: { label: 'Administrator', description: 'Full access — settings, compliance rules, users' },
  payroll_admin: { label: 'Payroll admin', description: 'Run payroll, view all data, export reports' },
  hr_manager: { label: 'HR manager', description: 'Manage employees, attendance, and leave' },
  viewer: { label: 'Viewer', description: 'Read-only access to dashboards and reports' },
};

export function seedUsersIfEmpty() {
  if (countUsers() > 0) return;
  const demo = [
    { username: 'admin@meridian.example', password: 'Admin@2026', role: 'admin', displayName: 'Amara Hassan (Admin)' },
    { username: 'payroll@meridian.example', password: 'Payroll@2026', role: 'payroll_admin', displayName: 'Deepak Sharma (Payroll Admin)' },
    { username: 'hr@meridian.example', password: 'HrManager@2026', role: 'hr_manager', displayName: 'Layla Haddad (HR Manager)' },
    { username: 'viewer@meridian.example', password: 'Viewer@2026', role: 'viewer', displayName: 'Board Observer (Viewer)' },
  ];
  const insert = db.prepare('INSERT INTO users (id, username, password_hash, role, display_name, created_at) VALUES (?,?,?,?,?,?)');
  const tx = db.transaction((rows) => { for (const u of rows) insert.run(crypto.randomUUID(), u.username, bcrypt.hashSync(u.password, 10), u.role, u.displayName, new Date().toISOString()); });
  tx(demo);
  console.log('Seeded demo users:', demo.map((d) => `${d.username} / ${d.password} (${d.role})`).join('\n  '));
}

export function login(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return null;
  const token = jwt.sign({ sub: user.id, username: user.username, role: user.role, name: user.display_name }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  return { token, user: { id: user.id, username: user.username, role: user.role, displayName: user.display_name } };
}

export function requireAuth(req, res, next) {
  const header = req.header('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized('Missing or invalid Authorization header'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, username: payload.username, role: payload.role, displayName: payload.name };
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
}

/** Restrict a route to one or more roles. Call after requireAuth. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden(`This action requires one of: ${roles.join(', ')} (you are ${req.user.role})`));
    next();
  };
}
