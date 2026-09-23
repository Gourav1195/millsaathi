import assert from 'node:assert/strict';

const base = process.env.MILLSAATHI_BASE_URL || 'http://127.0.0.1:8787';

async function request(path, options = {}) {
  const response = await fetch(base + path, { redirect: 'manual', ...options });
  const text = await response.text();
  let body = text;
  try { body = JSON.parse(text); } catch {}
  return { response, body };
}

function cookieFrom(response) {
  const value = response.headers.get('set-cookie') || '';
  return value.split(';', 1)[0];
}

function containsMoneyField(value) {
  if (Array.isArray(value)) return value.some(containsMoneyField);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => /paise|balance|outstanding|receivable|payable|rate_paise|commission|margin|billing/i.test(key) || containsMoneyField(child));
}

async function login(email) {
  const result = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'demo1234' }),
  });
  assert.equal(result.response.status, 200, `${email} login`);
  return cookieFrom(result.response);
}

async function createRoleAccount(ownerCookie, role) {
  const email = `authz-${role}-${Date.now()}@example.com`;
  const created = await request('/api/team/account', {
    method: 'POST',
    headers: { cookie: ownerCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Authz ${role}`, email, password: 'demo-password-123', role }),
  });
  assert.equal(created.response.status, 201, `owner should create ${role} account`);
  const loginResult = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'demo-password-123' }),
  });
  assert.equal(loginResult.response.status, 200, `${role} login`);
  return cookieFrom(loginResult.response);
}

const ownerCookie = await login('owner@demo.millsaathi.com');
const managerCookie = await login('manager@demo.millsaathi.com');
const accountantCookie = await login('accounts@demo.millsaathi.com');
const gateCookie = await createRoleAccount(ownerCookie, 'gate_operator');
const productionCookie = await createRoleAccount(ownerCookie, 'production_operator');
const viewerCookie = await createRoleAccount(ownerCookie, 'viewer');

const forbiddenForGate = [
  ['/api/payments', 'GET'],
  ['/api/saudas/export.csv', 'GET'],
  ['/api/documents', 'GET'],
  ['/api/billing/status', 'GET'],
  ['/api/team', 'GET'],
  ['/api/process-types', 'POST'],
];
for (const [path, method] of forbiddenForGate) {
  const result = await request(path, { method, headers: { cookie: gateCookie } });
  assert.equal(result.response.status, 403, `gate_operator must be denied ${method} ${path}`);
}

const forbiddenForProduction = [
  ['/api/payments', 'GET'],
  ['/api/saudas', 'POST'],
  ['/api/team', 'GET'],
  ['/api/billing/status', 'GET'],
  ['/api/documents', 'GET'],
];
for (const [path, method] of forbiddenForProduction) {
  const result = await request(path, {
    method,
    headers: { cookie: productionCookie, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: '{}' } : {}),
  });
  assert.equal(result.response.status, 403, `production_operator must be denied ${method} ${path}`);
}

const managerOverview = await request('/api/overview', { headers: { cookie: managerCookie } });
assert.equal(managerOverview.response.status, 200, 'manager overview');
assert.equal(containsMoneyField(managerOverview.body), false, 'manager overview must not include finance fields');
assert.equal(managerOverview.body.saudas, undefined, 'manager overview must not include saudas');

const managerDocuments = await request('/api/documents', { headers: { cookie: managerCookie } });
assert.equal(managerDocuments.response.status, 403, 'manager must not list documents');
const managerPayments = await request('/api/payments', { headers: { cookie: managerCookie } });
assert.equal(managerPayments.response.status, 403, 'manager must not list payments');

const viewerPatch = await request('/api/gate/test-id', {
  method: 'PATCH',
  headers: { cookie: viewerCookie, 'content-type': 'application/json' },
  body: JSON.stringify({ status: 'weighing' }),
});
assert.equal(viewerPatch.response.status, 403, 'viewer cannot mutate gate entries');

const accountantTeam = await request('/api/team', { headers: { cookie: accountantCookie } });
assert.equal(accountantTeam.response.status, 403, 'accountant cannot manage team');
const accountantPayments = await request('/api/payments', { headers: { cookie: accountantCookie } });
assert.equal(accountantPayments.response.status, 200, 'accountant can view payments');

const ownerTeam = await request('/api/team', { headers: { cookie: ownerCookie } });
assert.equal(ownerTeam.response.status, 200, 'owner can view team');

const crossTenant = await request('/api/team/' + (await request('/api/auth/me', { headers: { cookie: ownerCookie } })).body.id, {
  method: 'PATCH',
  headers: { cookie: gateCookie, 'content-type': 'application/json' },
  body: JSON.stringify({ active: 0 }),
});
assert.equal(crossTenant.response.status, 403, 'cross-tenant team mutation must be blocked by authorization or tenancy');

console.log('MillSaathi authorization checks passed');
