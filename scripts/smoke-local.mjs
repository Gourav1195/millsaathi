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
  return Object.entries(value).some(([key, child]) => key.includes('paise') || containsMoneyField(child));
}

const anonymousRoot = await request('/');
assert.equal(anonymousRoot.response.status, 200, 'anonymous root should serve marketing HTML');
const authConfig = await request('/api/auth/config');
assert.equal(authConfig.response.status, 200, 'auth configuration should be publicly readable');
assert.ok(!('TURNSTILE_SECRET_KEY' in authConfig.body), 'auth configuration must never expose the Turnstile secret');

const newMillEmail = `smoke-mill-${Date.now()}@example.com`;
const newMillSignup = await request('/api/auth/signup', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ mill_name: `Smoke Mill ${Date.now()}`, name: 'Smoke Owner', email: newMillEmail, password: 'smoke-password-123' }),
});
assert.equal(newMillSignup.response.status, 201, 'new mill signup should provision successfully');
const newMillCookie = cookieFrom(newMillSignup.response);
const newMillBilling = await request('/api/billing/status', { headers: { cookie: newMillCookie } });
assert.equal(newMillBilling.response.status, 200, 'new mill should have a billing status');
assert.equal(newMillBilling.body.billing?.plan, 'free', 'new mill billing should default to free');

const ownerLogin = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@demo.millsaathi.com', password: 'demo1234' }),
});
assert.equal(ownerLogin.response.status, 200, 'seeded owner login should work');
assert.ok(cookieFrom(ownerLogin.response), 'owner login should set a session cookie');

const ownerRoot = await request('/', { headers: { cookie: cookieFrom(ownerLogin.response) } });
assert.equal(ownerRoot.response.status, 302, 'authenticated root should redirect');
assert.equal(ownerRoot.response.headers.get('location'), '/app', 'authenticated root should redirect to /app');

const ownerOverview = await request('/api/overview', { headers: { cookie: cookieFrom(ownerLogin.response) } });
assert.equal(ownerOverview.response.status, 200, 'owner should be able to view the overview');
const assistantReply = await request('/api/assistant/chat', {
  method: 'POST',
  headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
  body: JSON.stringify({ message: 'What is our current stock?' }),
});
assert.equal(assistantReply.response.status, 200, 'owner should be able to use the read-only assistant');
assert.equal(typeof assistantReply.body.answer, 'string', 'assistant should return an answer');
assert.ok(Array.isArray(assistantReply.body.citations), 'assistant should return source citations');
assert.ok(['tool', 'local', 'gemini'].includes(assistantReply.body.provider), 'assistant should identify its response provider');
const forecastReply = await request('/api/assistant/chat', {
  method: 'POST',
  headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
  body: JSON.stringify({ message: "Forecast tomorrow's rice production" }),
});
assert.equal(forecastReply.response.status, 200, 'forecast tool should be available to the owner');
assert.equal(forecastReply.body.provider, 'tool', 'forecast must use the verified calculation tool, not Gemini');
assert.equal(forecastReply.body.capability, 'forecast', 'forecast should identify the tool used');
assert.match(forecastReply.body.answer, /Rice output forecast:|cannot produce a responsible forecast/i, 'forecast must contain a calculated result or an explicit data-sufficiency warning');
assert.ok(Array.isArray(ownerOverview.body.processing_today), 'overview should expose generic processing totals for the current day');
assert.equal(ownerOverview.body.kpis.incoming_today_kg, ownerOverview.body.kpis.paddy_in_today_kg, 'generic inbound KPI should preserve the legacy alias');
assert.equal(ownerOverview.body.kpis.outgoing_today_kg, ownerOverview.body.kpis.rice_out_today_kg, 'generic outbound KPI should preserve the legacy alias');
for (const [range, size] of [['daily', 7], ['weekly', 5], ['monthly', 12]]) {
  const rangedOverview = await request('/api/overview?range=' + range, { headers: { cookie: cookieFrom(ownerLogin.response) } });
  assert.equal(rangedOverview.response.status, 200, range + ' overview should load');
  assert.equal(rangedOverview.body.trend?.range, range, range + ' trend should identify its range');
  assert.equal(rangedOverview.body.trend?.data?.length, size, range + ' trend should have the expected buckets');
}
const dailyGateOverview = await request('/api/overview?range=daily', { headers: { cookie: cookieFrom(ownerLogin.response) } });
const monthlyGateOverview = await request('/api/overview?range=monthly', { headers: { cookie: cookieFrom(ownerLogin.response) } });
assert.deepEqual(
  dailyGateOverview.body.gate?.map((gate) => gate.id),
  monthlyGateOverview.body.gate?.map((gate) => gate.id),
  'the Gate & Weighbridge list must not be limited by the dashboard trend range',
);
assert.equal(
  dailyGateOverview.body.gate?.length,
  dailyGateOverview.body.onboarding?.gate_count,
  'the Gate & Weighbridge list should include every gate entry for the mill',
);
const processTypes = await request('/api/process-types', { headers: { cookie: newMillCookie } });
for (const name of ['Pre-Cleaning', 'De-husking (Hulling)', 'Paddy Separation', 'Whitening and Polishing', 'Grading and Color Sorting', 'Weighing and Packaging']) {
  assert.ok(processTypes.body.process_types?.some((type) => type.name === name), 'default process type should be available: ' + name);
}
const ownerBilling = await request('/api/billing/status', { headers: { cookie: cookieFrom(ownerLogin.response) } });
assert.equal(ownerBilling.response.status, 200, 'owner should be able to view billing status');
assert.equal(ownerBilling.body.billing?.plan, 'free', 'newly provisioned mills should start on the free plan');
assert.equal(ownerBilling.body.billing?.checkout_available, false, 'billing checkout must remain disabled until it is implemented');
const supplier = ownerOverview.body.suppliers?.[0];
const item = ownerOverview.body.items?.[0];
assert.ok(supplier?.id && item?.id, 'seeded overview should include a supplier and item');
const invalidSauda = await request('/api/saudas', {
  method: 'POST',
  headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
  body: JSON.stringify({ direction: 'in', supplier_id: supplier.id, item_id: item.id, quantity: 10, unit: 'TONNE', rate_paise_per_qtl: 100, delivery_start: '2026-09-20', delivery_end: '2026-09-19', delivery_tolerance_pct: 5 }),
});
assert.equal(invalidSauda.response.status, 400, 'Sauda delivery window must reject reversed dates');
const ownerCreatedAccount = await request('/api/team/account', {
  method: 'POST',
  headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Smoke Account', email: `smoke-${Date.now()}@example.com`, password: 'smoke-password-123', role: 'viewer' }),
});
assert.equal(ownerCreatedAccount.response.status, 201, 'owner should be able to create an active team account');
const ownerMe = await request('/api/auth/me', { headers: { cookie: cookieFrom(ownerLogin.response) } });
const ownerRoleChange = await request('/api/team/' + ownerMe.body.id, {
  method: 'PATCH',
  headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
  body: JSON.stringify({ role: 'viewer' }),
});
assert.equal(ownerRoleChange.response.status, 400, 'owner role must not be self-demoted');
const isolatedTeamLookup = await request('/api/team/' + ownerCreatedAccount.body.id, {
  method: 'PATCH',
  headers: { cookie: newMillCookie, 'content-type': 'application/json' },
  body: JSON.stringify({ active: 0 }),
});
assert.equal(isolatedTeamLookup.response.status, 404, 'a member from another tenant must not be addressable');
await request('/api/auth/logout', { method: 'POST', headers: { cookie: newMillCookie } });
const importPreview = await request('/api/parties/import/validate', {
  method: 'POST',
  headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
  body: JSON.stringify({ kind: 'supplier', rows: [{ name: '', type: 'invalid' }] }),
});
assert.equal(importPreview.response.status, 200, 'party import preview should be available');
assert.equal(importPreview.body.errors, 1, 'party import preview should report row validation errors');
const invalidLot = await request('/api/lots', {
  method: 'POST',
  headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
  body: JSON.stringify({ qty_kg: -1 }),
});
assert.equal(invalidLot.response.status, 400, 'lot creation must reject negative quantities');
const invalidQualityLot = await request('/api/lots', {
  method: 'POST',
  headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
  body: JSON.stringify({ item_id: item.id, quantity: 1, unit: 'QUINTAL', broken_pct: 101 }),
});
assert.equal(invalidQualityLot.response.status, 400, 'lot quality percentages must be bounded');
const processGodown = ownerOverview.body.godowns?.[0];
const processOutputItem = ownerOverview.body.items?.find((candidate) => candidate.id !== item.id);
const processLossItem = ownerOverview.body.items?.find((candidate) => candidate.id !== item.id && candidate.id !== processOutputItem?.id);
assert.ok(processGodown?.id && processOutputItem?.id && processLossItem?.id, 'seeded overview should include process stock references');
const processLot = await request('/api/lots', {
  method: 'POST',
  headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
  body: JSON.stringify({ item_id: item.id, godown_id: processGodown.id, quantity: 1, unit: 'QUINTAL' }),
});
assert.equal(processLot.response.status, 201, 'owner should be able to create a process source lot');
const processType = await request('/api/process-types', {
  method: 'POST',
  headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
  body: JSON.stringify({ name: `Smoke process ${Date.now()}` }),
});
assert.equal(processType.response.status, 201, 'owner should be able to create a process type');
const processTemplate = await request('/api/process-types/' + processType.body.id + '/template', {
  method: 'PUT',
  headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
  body: JSON.stringify({
    default_unit: 'QUINTAL',
    default_destination_godown_id: processGodown.id,
    lines: [
      { line_type: 'INPUT', semantic_type: 'input', item_id: item.id, default_unit: 'KG', required: true },
      { line_type: 'OUTPUT', semantic_type: 'main', item_id: processOutputItem.id, default_unit: 'KG', required: true },
      { line_type: 'LOSS', semantic_type: 'waste', item_id: processLossItem.id, default_unit: 'KG', required: false, auto_calculate: true },
    ],
  }),
});
assert.equal(processTemplate.response.status, 200, 'owner should be able to configure a process template');
const processWorkspace = await request('/api/process-workspace?process_type_id=' + processType.body.id, { headers: { cookie: cookieFrom(ownerLogin.response) } });
assert.equal(processWorkspace.response.status, 200, 'configured process workspace should load');
assert.equal(processWorkspace.body.template_lines?.length, 3, 'workspace should expose configured process lines');
assert.equal(processWorkspace.body.lots?.find((lot) => lot.id === processLot.body.id)?.item_id, item.id, 'workspace should expose source lot item metadata');
const inferredProcessRun = await request('/api/process-runs', {
  method: 'POST',
  headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
  body: JSON.stringify({ process_type_id: processType.body.id, lines: [
    { line_type: 'INPUT', lot_id: processLot.body.id, quantity: 10, unit: 'KG' },
    { line_type: 'OUTPUT', template_line_id: processWorkspace.body.template_lines.find((line) => line.line_type === 'OUTPUT').id, quantity: 8, unit: 'KG' },
    { line_type: 'LOSS', template_line_id: processWorkspace.body.template_lines.find((line) => line.line_type === 'LOSS').id, quantity: 2, unit: 'KG' },
  ] }),
});
assert.equal(inferredProcessRun.response.status, 201, 'template process run should infer item, godown and unit metadata');
const templatePostedOverview = await request('/api/overview', { headers: { cookie: cookieFrom(ownerLogin.response) } });
assert.ok(templatePostedOverview.body.lots?.some((lot) => lot.item_id === processOutputItem.id && lot.godown_id === processGodown.id && Number(lot.qty_kg) === 8), 'template run should create an output lot in the default godown');
const voidedTemplateRun = await request('/api/process-runs/' + inferredProcessRun.body.id + '/void', {
  method: 'POST',
  headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
  body: JSON.stringify({ reason: 'Smoke test void' }),
});
assert.equal(voidedTemplateRun.response.status, 200, 'template process run should remain voidable');
const restoredOverview = await request('/api/overview', { headers: { cookie: cookieFrom(ownerLogin.response) } });
assert.equal(Number(restoredOverview.body.lots?.find((lot) => lot.id === processLot.body.id)?.qty_kg), 100, 'voiding a template run should restore the source lot');
const processRun = await request('/api/process-runs', {
  method: 'POST',
  headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
  body: JSON.stringify({ process_type_id: processType.body.id, lines: [
    { line_type: 'INPUT', item_id: item.id, lot_id: processLot.body.id, quantity: 10, unit: 'KG' },
    { line_type: 'OUTPUT', item_id: processOutputItem.id, quantity: 8, unit: 'KG' },
    { line_type: 'LOSS', item_id: processLossItem.id, quantity: 2, unit: 'KG' },
  ] }),
});
assert.equal(processRun.response.status, 201, 'generic processing run should post successfully');
const processedOverview = await request('/api/overview', { headers: { cookie: cookieFrom(ownerLogin.response) } });
assert.ok(processedOverview.body.processing_today?.some((row) => row.line_type === 'INPUT'), 'overview should include today\'s generic process input');
const negativeStock = await request('/api/stock-movements', {
  method: 'POST',
  headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
  body: JSON.stringify({ direction: 'OUT', item_id: item.id, quantity: 999999999, unit: 'KG' }),
});
assert.equal(negativeStock.response.status, 400, 'manual outbound movement must not create negative stock');
const ownerDocument = await request('/api/documents', {
  method: 'POST',
  headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
  body: JSON.stringify({ document_type: 'WEIGHMENT_SLIP', issue_date: '2026-09-17', lines: [{ item_id: item.id, description: 'Smoke weighment', quantity: 1, unit: 'TONNE', rate_paise: 0, taxable_paise: 0 }] }),
});
assert.equal(ownerDocument.response.status, 201, 'owner should be able to create a business document');
assert.match(ownerDocument.body.document_no || '', /^WGT-2026-27-\d+$/, 'documents should use financial-year-aware numbering');
const completedGate = ownerOverview.body.gate?.find((gate) => gate.status === 'done' && gate.gross_kg != null);
if (completedGate) {
  const immutableGate = await request('/api/gate/' + completedGate.id, {
    method: 'PATCH',
    headers: { cookie: cookieFrom(ownerLogin.response), 'content-type': 'application/json' },
    body: JSON.stringify({ gross_kg: Number(completedGate.gross_kg) + 1 }),
  });
  assert.equal(immutableGate.response.status, 409, 'completed gate weights must be immutable');
}

const managerLogin = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'manager@demo.millsaathi.com', password: 'demo1234' }),
});
assert.equal(managerLogin.response.status, 200, 'seeded manager login should work');
const managerCookie = cookieFrom(managerLogin.response);
assert.ok(managerCookie, 'manager login should set a session cookie');

const managerOverview = await request('/api/overview', { headers: { cookie: managerCookie } });
assert.equal(managerOverview.response.status, 200, 'manager should be able to view the overview');
assert.equal(containsMoneyField(managerOverview.body), false, 'manager overview must not contain paise fields');

const managerInvite = await request('/api/team/invite', {
  method: 'POST',
  headers: { cookie: managerCookie, 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Blocked User', email: 'blocked@example.com', role: 'viewer' }),
});
assert.equal(managerInvite.response.status, 403, 'manager must not invite team members');

const managerDocuments = await request('/api/documents', { headers: { cookie: managerCookie } });
assert.equal(managerDocuments.response.status, 200, 'manager should be able to view documents');
assert.equal(containsMoneyField(managerDocuments.body), false, 'manager documents must not contain paise fields');
const managerPayments = await request('/api/payments', { headers: { cookie: managerCookie } });
assert.equal(managerPayments.response.status, 200, 'manager should be able to view payment history');
assert.equal(containsMoneyField(managerPayments.body), false, 'manager payment history must not contain paise fields');
const managerExcel = await request('/api/documents/export.xls', { headers: { cookie: managerCookie } });
assert.equal(managerExcel.response.status, 200, 'manager should be able to export documents to Excel');
assert.match(managerExcel.response.headers.get('content-type') || '', /ms-excel/, 'document Excel export should use an Excel content type');
assert.equal(managerExcel.body.includes ? managerExcel.body.includes('paise') : false, false, 'manager Excel export must not expose paise labels');

await request('/api/auth/logout', { method: 'POST', headers: { cookie: cookieFrom(ownerLogin.response) } });
await request('/api/auth/logout', { method: 'POST', headers: { cookie: managerCookie } });

console.log('MillSaathi local smoke checks passed');
