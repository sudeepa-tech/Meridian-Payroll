import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { seedIfEmpty } from './data/seed.js';
import { seedAttendanceIfEmpty } from './data/seedAttendance.js';
// import { settings, compliance, employees, payroll, aiRouter, attendanceRouter, leaveRouter, reportsRouter, authRouter } from './routes.js';
import { settings, compliance, employees, payroll, aiRouter, attendanceRouter, leaveRouter, reportsRouter, authRouter, policyRouter } from './routes.js';
import { seedUsersIfEmpty, requireAuth } from './core/auth.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false }));
app.use((req, res, next) => { const t = Date.now(); res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - t}ms`)); next(); });

seedIfEmpty();
seedAttendanceIfEmpty();
seedUsersIfEmpty();

app.get('/api/health', (req, res) => res.json({ ok: true, version: '1.0.0', time: new Date().toISOString() }));
app.use('/api/auth', authRouter);

// Everything below requires a valid bearer token.
app.use('/api', requireAuth);

app.use('/api/settings', settings);
app.use('/api/compliance', compliance);
app.use('/api/employees', employees);
app.use('/api/payroll', payroll);
app.use('/api/ai', aiRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/leave', leaveRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/policies', policyRouter);
app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route ${req.method} ${req.path}` } }));
app.use((err, req, res, next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { code: err.code ?? 'INTERNAL', message: status >= 500 ? 'Unexpected server error' : err.message, details: err.details } });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Payroll API listening on http://localhost:${PORT}`));
