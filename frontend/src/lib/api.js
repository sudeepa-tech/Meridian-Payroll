// const BASE = import.meta.env.VITE_API_URL || '/api';
// my new code
const BASE = `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api`;

function getToken() { return localStorage.getItem('meridian_token'); }
export function setToken(t) { t ? localStorage.setItem('meridian_token', t) : localStorage.removeItem('meridian_token'); }

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function req(path, opts = {}) {
  const token = getToken();
  const res = await fetch(BASE + path, {
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...opts,
  });
  if (res.status === 401) { onUnauthorized(); }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Request failed');
    err.details = data?.error?.details;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  health: () => req('/health'),
  auth: {
    login: (username, password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    me: () => req('/auth/me'),
  },
  settings: {
    get: () => req('/settings'),
    update: (body) => req('/settings', { method: 'PUT', body: JSON.stringify(body) }),
    countries: () => req('/settings/countries'),
    country: (code) => req(`/settings/countries/${code}`),
    currencies: () => req('/settings/currencies'),
    audit: () => req('/settings/audit'),
  },
  compliance: {
    get: (code) => req(`/compliance/${code}`),
    update: (code, body) => req(`/compliance/${code}`, { method: 'PUT', body: JSON.stringify(body) }),
    reset: (code) => req(`/compliance/${code}`, { method: 'DELETE' }),
    checklist: (code) => req(`/compliance/${code}/checklist`),
  },
  policies: {
  fields: () => req('/policies/fields'),
  list: () => req('/policies'),
  get: (id) => req(`/policies/${id}`),
  create: (body) => req('/policies', {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  apply: (id) => req(`/policies/${id}/apply`, {
    method: 'POST'
  }),
  remove: (id) => req(`/policies/${id}`, {
    method: 'DELETE'
  }),
},
  attendance: {
    list: (params = {}) => req(`/attendance?${new URLSearchParams(params)}`),
    get: (employeeId, period = '2026-09') => req(`/attendance/${employeeId}?period=${period}`),
    overview: (period = '2026-09') => req(`/attendance/summary/overview?period=${period}`),
  },
  leave: {
    requests: (params = {}) => req(`/leave/requests?${new URLSearchParams(params)}`),
    decide: (id, decision) => req(`/leave/requests/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision }) }),
    balances: (employeeId) => req(`/leave/balances/${employeeId}`),
  },
  reports: {
    registerXlsxUrl: (params = {}) => `${BASE}/reports/payroll-register.xlsx?${new URLSearchParams(params)}`,
    summaryPdfUrl: (params = {}) => `${BASE}/reports/payroll-summary.pdf?${new URLSearchParams(params)}`,
    costXlsxUrl: () => `${BASE}/reports/cost-by-country.xlsx`,
    riskPdfUrl: () => `${BASE}/reports/compliance-risk.pdf`,
  },
  employees: {
    list: (params = {}) => req(`/employees?${new URLSearchParams(params)}`),
    get: (id) => req(`/employees/${id}`),
    create: (body) => req('/employees', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => req(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id) => req(`/employees/${id}`, { method: 'DELETE' }),
  },
  payroll: {
    dashboard: () => req('/payroll/dashboard'),
    preview: (body) => req('/payroll/preview', { method: 'POST', body: JSON.stringify(body) }),
    run: (body) => req('/payroll/runs', { method: 'POST', body: JSON.stringify(body) }),
    runs: () => req('/payroll/runs'),
    getRun: (id) => req(`/payroll/runs/${id}`),
    history: () => req('/payroll/history'),
    wpsUrl: (id) => `${BASE}/payroll/runs/${id}/wps`,
  },
  ai: {
    forecast: (months = 6) => req(`/ai/forecast?months=${months}`),
    risks: () => req('/ai/risks'),
    integrity: () => req('/ai/integrity'),
    ask: (question) => req('/ai/ask', { method: 'POST', body: JSON.stringify({ question }) }),
  },
};

export function fmtMoney(amount, currency, decimals = 2) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount ?? 0);
  } catch {
    return `${(amount ?? 0).toFixed(decimals)} ${currency}`;
  }
}
export const fmtNum = (n, d = 0) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(n ?? 0);
