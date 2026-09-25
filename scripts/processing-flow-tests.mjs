import assert from 'node:assert/strict';

// A separate local test tenant keeps demo/user inventory untouched.
const base = 'http://127.0.0.1:8787';
let cookie = '';
async function request(path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + '/api' + path, { method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  return data;
}
await request('/auth/signup', 'POST', { mill_name: `Processing regression ${Date.now()}`, mill_type: 'RICE', preferred_unit: 'KG', name: 'Regression Owner', email: `processing-${Date.now()}@example.com`, password: 'local-regression-123' }, 201);
const overview = await request('/overview');
const [raw, output] = overview.items;
assert.ok(raw && output && overview.godowns[0]);
const godown = overview.godowns[0].id;
const lot = await request('/lots', 'POST', { item_id: raw.id, godown_id: godown, quantity: 500, unit: 'KG' }, 201);
const type = await request('/process-types', 'POST', { name: 'Allocation regression process' }, 201);
await request(`/process-types/${type.id}/template`, 'PUT', { default_unit: 'KG', default_destination_godown_id: godown, lines: [
  { line_type: 'INPUT', semantic_type: 'input', item_id: raw.id, default_unit: 'KG' },
  { line_type: 'OUTPUT', semantic_type: 'main', item_id: output.id, default_unit: 'KG', expected_yield_min_pct: 100, expected_yield_max_pct: 100 },
] });
const chain = await request('/processing-chains', 'POST', { name: 'Allocation regression chain' }, 201);
await request(`/processing-chains/${chain.id}/steps`, 'PUT', { steps: [{ process_type_id: type.id }] });
async function draft(qty) {
  const run = await request('/chain-runs', 'POST', { chain_id: chain.id, planned_input: qty, unit: 'KG' }, 201);
  await request(`/chain-runs/${run.chain_run.id}`, 'PATCH', { planned_input: qty, unit: 'KG', input_allocations: [{ lot_id: lot.id, quantity_base: qty }] });
  return request(`/chain-runs/${run.chain_run.id}`);
}
const first = await draft(200);
assert.deepEqual(first.input_allocations, [{ lot_id: lot.id, quantity_base: 200 }]);
assert.equal((await request('/overview')).lots.find((entry) => entry.id === lot.id).qty_kg, 500, 'saving a draft does not consume inventory');
await request(`/chain-runs/${first.chain_run.id}`, 'PATCH', { planned_input: 600, input_allocations: [{ lot_id: lot.id, quantity_base: 600 }] }, 400);
await request(`/chain-runs/${first.chain_run.id}`, 'PATCH', { planned_input: 400, input_allocations: [{ lot_id: lot.id, quantity_base: 200 }, { lot_id: lot.id, quantity_base: 200 }] }, 400);
await request(`/chain-runs/${first.chain_run.id}/start`, 'POST', {});
const step = first.run_steps[0];
const payload = { input_quantity: 200, input_allocations: [{ lot_id: lot.id, quantity: 200, unit: 'KG' }], destination_godown_id: godown, lines: [{ line_id: step.lines.find((line) => line.kind === 'main').id, quantity: 200, unit: 'KG' }] };
await request(`/chain-runs/${first.chain_run.id}/steps/${step.id}/actuals`, 'POST', payload, 201);
assert.equal((await request('/overview')).lots.find((entry) => entry.id === lot.id).qty_kg, 300, 'partial processing leaves remaining stock');
const ledger = await request(`/stock-ledger?item_id=${raw.id}`);
assert.ok(ledger.movements.some((entry) => entry.source_type === 'PROCESS_RUN' && entry.direction === 'OUT' && entry.quantity_base === 200 && entry.balance_base === 300));
// Two started runs race for the same remaining lot. Exactly one may consume it.
const second = await draft(200);
const third = await draft(200);
for (const run of [second, third]) await request(`/chain-runs/${run.chain_run.id}/start`, 'POST', {});
const results = await Promise.all([second, third].map(async (run) => {
  const current = run.run_steps[0];
  const response = await fetch(`${base}/api/chain-runs/${run.chain_run.id}/steps/${current.id}/actuals`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, lines: [{ line_id: current.lines.find((line) => line.kind === 'main').id, quantity: 200, unit: 'KG' }] }) });
  return { run, status: response.status, body: await response.json() };
}));
assert.equal(results.filter((entry) => entry.status === 201).length, 1, JSON.stringify(results));
assert.ok(results.every((entry) => [201, 400, 409].includes(entry.status)), JSON.stringify(results));
assert.equal((await request('/overview')).lots.find((entry) => entry.id === lot.id).qty_kg, 100);
const winner = results.find((entry) => entry.status === 201).run;
const winnerStep = winner.run_steps[0];
const duplicate = await fetch(`${base}/api/chain-runs/${winner.chain_run.id}/steps/${winnerStep.id}/actuals`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
assert.ok([404, 409].includes(duplicate.status));
await request(`/chain-runs/${winner.chain_run.id}/void`, 'POST', { reason: 'Regression reversal' });
assert.equal((await request('/overview')).lots.find((entry) => entry.id === lot.id).qty_kg, 300, 'void restores only its own consumption');
const reversedLedger = await request(`/stock-ledger?item_id=${raw.id}`);
assert.ok(reversedLedger.movements.some((entry) => entry.source_type === 'PROCESS_RUN' && entry.status === 'VOID'));
console.log('PASS: draft restore, partial consumption, invalid/duplicate allocations, concurrent shortage rollback, duplicate post, ledger and void.');

const nextType = await request('/process-types', 'POST', { name: 'Second regression process' }, 201);
await request(`/process-types/${nextType.id}/template`, 'PUT', { default_unit: 'KG', default_destination_godown_id: godown, lines: [
  { line_type: 'INPUT', semantic_type: 'input', item_id: output.id, default_unit: 'KG' },
  { line_type: 'OUTPUT', semantic_type: 'main', item_id: raw.id, default_unit: 'KG' },
] });
const twoStep = await request('/processing-chains', 'POST', { name: 'Partial two-step regression' }, 201);
await request(`/processing-chains/${twoStep.id}/steps`, 'PUT', { steps: [{ process_type_id: type.id }, { process_type_id: nextType.id }] });
let multi = await request('/chain-runs', 'POST', { chain_id: twoStep.id, planned_input: 50, unit: 'KG' }, 201);
await request(`/chain-runs/${multi.chain_run.id}`, 'PATCH', { planned_input: 50, input_allocations: [{ lot_id: lot.id, quantity_base: 50 }] });
multi = await request(`/chain-runs/${multi.chain_run.id}/start`, 'POST', {});
multi = await request(`/chain-runs/${multi.chain_run.id}/steps/${multi.run_steps[0].id}/actuals`, 'POST', {
  input_quantity: 40, input_allocations: [{ lot_id: lot.id, quantity: 40, unit: 'KG' }], destination_godown_id: godown,
  lines: [{ line_id: multi.run_steps[0].lines.find((line) => line.kind === 'main').id, quantity: 40, unit: 'KG' }],
}, 201);
assert.equal(multi.run_steps[1].forecast_input_base, 40, 'next step uses actual output, not the old planned quantity');
assert.equal(multi.input_allocations[0].quantity_base, 40, 'posted consumption replaces original draft intent');
const nextInputs = await request(`/chain-runs/${multi.chain_run.id}/available-inputs?step_id=${multi.run_steps[1].id}`);
assert.equal(nextInputs.eligible.length, 1, 'other stock of the same material must not appear for step two');
assert.equal(nextInputs.eligible[0].id, multi.run_steps[0].lines.find((line) => line.kind === 'main').lot_id);
console.log('PASS: partial input cascades to the next step and only its own previous output is selectable.');

const wrongLot = await request('/lots', 'POST', { item_id: raw.id, godown_id: godown, quantity: 100, unit: 'KG' }, 201);
let invalid = await request('/chain-runs', 'POST', { chain_id: twoStep.id, planned_input: 30, unit: 'KG' }, 201);
await request(`/chain-runs/${invalid.chain_run.id}`, 'PATCH', { planned_input: 30, unit: 'KG', input_allocations: [{ lot_id: wrongLot.id, quantity_base: 30 }] });
invalid = await request(`/chain-runs/${invalid.chain_run.id}/start`, 'POST', {});
invalid = await request(`/chain-runs/${invalid.chain_run.id}/steps/${invalid.run_steps[0].id}/actuals`, 'POST', {
  input_quantity: 30, input_allocations: [{ lot_id: wrongLot.id, quantity: 30, unit: 'KG' }], destination_godown_id: godown,
  lines: [{ line_id: invalid.run_steps[0].lines.find((line) => line.kind === 'main').id, quantity: 30, unit: 'KG' }],
}, 201);
const invalidStepTwo = invalid.run_steps[1];
const rejectWrongInput = await fetch(`${base}/api/chain-runs/${invalid.chain_run.id}/steps/${invalidStepTwo.id}/actuals`, {
  method: 'POST', headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({
    input_lot_id: wrongLot.id,
    input_quantity: 30,
    destination_godown_id: godown,
    lines: [{ line_id: invalidStepTwo.lines.find((line) => line.kind === 'main').id, quantity: 30, unit: 'KG' }],
  }),
});
assert.equal(rejectWrongInput.status, 400, JSON.stringify(await rejectWrongInput.json()));
console.log('PASS: step two rejects lots that are not from the previous posted output.');

const skipAttempt = await fetch(`${base}/api/chain-runs/${multi.chain_run.id}/steps/${multi.run_steps[1].id}/skip`, {
  method: 'POST', headers: { cookie, 'content-type': 'application/json' },
});
assert.equal(skipAttempt.status, 400, JSON.stringify(await skipAttempt.json()));
console.log('PASS: skip step is blocked for linear chain runs.');

const bareType = await request('/process-types', 'POST', { name: 'Unconfigured regression process' }, 201);
const bareChain = await request('/processing-chains', 'POST', { name: 'Unconfigured regression chain' }, 201);
await request(`/processing-chains/${bareChain.id}/steps`, 'PUT', { steps: [{ process_type_id: bareType.id }] });
const bareRun = await request('/chain-runs', 'POST', { chain_id: bareChain.id, planned_input: 10, unit: 'KG' }, 201);
await request(`/chain-runs/${bareRun.chain_run.id}`, 'PATCH', {
  planned_input: 10,
  unit: 'KG',
  input_allocations: [{ lot_id: lot.id, quantity_base: 10 }],
}, 400);
console.log('PASS: unconfigured process input lines are rejected on draft save.');
