import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { COUNTRIES, FX_RATES } from '../config/countries.js';
import { loadAll, persist } from './db.js';

/* ---------- Errors ---------- */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status; this.code = code; this.details = details;
  }
}
export const notFound = (what) => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message, details);
export const forbidden = (message = 'You do not have permission to perform this action') => new AppError(403, 'FORBIDDEN', message);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message);

/* ---------- Async route wrapper ---------- */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- Money ---------- */
export const round = (n, decimals = 2) => {
  const f = 10 ** decimals;
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
};

export function convert(amount, from, to, rates = FX_RATES) {
  if (from === to) return amount;
  const usd = amount / rates[from];
  return usd * rates[to];
}

/* ---------- Store: in-memory working set, backed by SQLite (see core/db.js) ----------
   The calculation engine, AI module, and report generator all read plain JS arrays off
   `store.state` for simplicity — this class is the only bridge to the database. Every
   save() call runs a transactional bulk-sync of the changed entity to SQLite, so the app
   gets real ACID durability, foreign-key integrity, and indexed queries underneath a simple
   in-memory API. */
class Store {
  constructor() {
    const loaded = loadAll();
    this.state = {
      employees: loaded.employees, payRuns: loaded.payRuns, history: loaded.history,
      settings: loaded.settings, overrides: loaded.overrides, audit: loaded.audit,
      attendance: loaded.attendance, leaveRequests: loaded.leaveRequests,
      policies: loaded.policies,
    };
  }
  /** Persist one or more entities. Defaults to everything if none named (cheap at this data size). */
  save(entities) {
    const list = entities ?? ['employees', 'attendance', 'leaveRequests', 'payRuns', 'history', 'overrides', 'settings', 'audit', 'policies'];
    for (const e of list) {
      if (e === 'overrides') persist.overrides(this.state.overrides);
      else if (e === 'settings' && this.state.settings) persist.settings(this.state.settings);
      else if (e === 'audit') persist.audit(this.state.audit);
      else if (persist[e]) persist[e](this.state[e]);
    }
  }
  audit(actor, action, meta = {}) {
    this.state.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor, action, ...meta });
    this.state.audit = this.state.audit.slice(0, 500);
  }
}
export const store = new Store();

/** Country config with runtime overrides from Compliance settings applied. */
export function getCountry(code) {
  const base = COUNTRIES[code];
  if (!base) throw notFound(`Country ${code}`);
  const ov = store.state.overrides?.[code];
  return ov ? deepMerge(structuredClone(base), ov) : structuredClone(base);
}

export function deepMerge(target, src) {
  for (const k of Object.keys(src)) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      target[k] = deepMerge(target[k] ?? {}, src[k]);
    } else target[k] = src[k];
  }
  return target;
}

/* ---------- Lightweight validation ---------- */
export function validate(body, schema) {
  const errors = [];
  for (const [key, rule] of Object.entries(schema)) {
    const v = body[key];
    if (rule.required && (v === undefined || v === null || v === '')) { errors.push(`${key} is required`); continue; }
    if (v === undefined) continue;
    if (rule.type === 'number' && (typeof v !== 'number' || Number.isNaN(v))) errors.push(`${key} must be a number`);
    if (rule.type === 'string' && typeof v !== 'string') errors.push(`${key} must be text`);
    if (rule.min !== undefined && v < rule.min) errors.push(`${key} must be ≥ ${rule.min}`);
    if (rule.oneOf && !rule.oneOf.includes(v)) errors.push(`${key} must be one of ${rule.oneOf.join(', ')}`);
  }
  if (errors.length) throw badRequest('Validation failed', errors);
}
