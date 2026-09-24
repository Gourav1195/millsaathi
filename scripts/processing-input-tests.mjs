/**
 * Unit tests for stock lot grouping and processing input allocation validation.
 * Run: node --experimental-strip-types scripts/processing-input-tests.mjs
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  groupStockLots,
  stockGroupKey,
  validateInputAllocations,
} from '../src/stockLotProcessing.ts';

function lot(overrides) {
  return {
    id: overrides.id,
    code: overrides.code ?? overrides.id,
    item_id: overrides.item_id,
    item_name: overrides.item_name ?? 'Paddy',
    qty_kg: overrides.qty_kg,
    godown_id: overrides.godown_id ?? null,
    godown_name: overrides.godown_name ?? null,
    sauda_id: overrides.sauda_id ?? null,
    sauda_code: overrides.sauda_code ?? null,
  };
}

// Duplicate entries must not bypass availability; fractional kg must not be rounded silently.
{
  const lotsById = new Map([['l1', lot({ id: 'l1', item_id: 'paddy', qty_kg: 500 })]]);
  for (const allocations of [
    [{ lot_id: 'l1', quantity_base: 300 }, { lot_id: 'l1', quantity_base: 300 }],
    [{ lot_id: 'l1', quantity_base: 0.5 }],
  ]) assert.equal(validateInputAllocations({ allocations, requiredTotalBase: allocations.reduce((sum, entry) => sum + entry.quantity_base, 0), lotsById }).ok, false);
}

// Exercise the actual migration guards with a stale availability check.
{
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE processing_chain_runs (id TEXT PRIMARY KEY);
    CREATE TABLE lots (id TEXT PRIMARY KEY, qty_kg INTEGER);
    CREATE TABLE process_runs (id TEXT PRIMARY KEY, mill_id TEXT, chain_run_step_id TEXT, status TEXT);
    CREATE TABLE consumption_test (quantity INTEGER);
    INSERT INTO lots VALUES ('lot', 100);`);
  db.exec(readFileSync(new URL('../migrations/0029_chain_input_drafts.sql', import.meta.url), 'utf8'));
  db.exec('BEGIN');
  try {
    db.exec(`INSERT INTO consumption_test VALUES (200); UPDATE lots SET qty_kg = qty_kg - 200 WHERE id = 'lot';`);
    assert.fail('shortage must abort the batch');
  } catch (error) {
    db.exec('ROLLBACK');
    assert.match(error.message, /insufficient quantity/);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM consumption_test').get().count, 0);
  assert.equal(db.prepare('SELECT qty_kg FROM lots').get().qty_kg, 100);
  db.exec(`INSERT INTO process_runs VALUES ('a','mill','step','POSTED');`);
  assert.throws(() => db.exec(`INSERT INTO process_runs VALUES ('b','mill','step','POSTED')`), /UNIQUE/);
  db.close();
}

// One purchase with material in three godowns groups into one row.
{
  const groups = groupStockLots([
    lot({ id: 'l1', item_id: 'paddy', sauda_id: 's1', sauda_code: 'PUR-1', qty_kg: 300, godown_name: 'A' }),
    lot({ id: 'l2', item_id: 'paddy', sauda_id: 's1', sauda_code: 'PUR-1', qty_kg: 200, godown_name: 'B' }),
    lot({ id: 'l3', item_id: 'paddy', sauda_id: 's1', sauda_code: 'PUR-1', qty_kg: 500, godown_name: 'C' }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].total_available_kg, 1000);
  assert.equal(groups[0].allocations.length, 3);
  assert.equal(stockGroupKey('paddy', 's1'), groups[0].group_key);
}

// Partial processing from one godown.
{
  const lotsById = new Map([
    ['l1', lot({ id: 'l1', item_id: 'paddy', qty_kg: 500, godown_name: 'A' })],
  ]);
  const ok = validateInputAllocations({
    allocations: [{ lot_id: 'l1', quantity_base: 250 }],
    requiredTotalBase: 250,
    lotsById,
  });
  assert.equal(ok.ok, true);
}

// Processing from multiple godowns must match total.
{
  const lotsById = new Map([
    ['l1', lot({ id: 'l1', item_id: 'paddy', qty_kg: 300, godown_name: 'A' })],
    ['l2', lot({ id: 'l2', item_id: 'paddy', qty_kg: 200, godown_name: 'B' })],
  ]);
  const ok = validateInputAllocations({
    allocations: [
      { lot_id: 'l1', quantity_base: 300 },
      { lot_id: 'l2', quantity_base: 200 },
    ],
    requiredTotalBase: 500,
    lotsById,
  });
  assert.equal(ok.ok, true);
  const badTotal = validateInputAllocations({
    allocations: [
      { lot_id: 'l1', quantity_base: 300 },
      { lot_id: 'l2', quantity_base: 100 },
    ],
    requiredTotalBase: 500,
    lotsById,
  });
  assert.equal(badTotal.ok, false);
}

// Over-consumption blocked.
{
  const lotsById = new Map([
    ['l1', lot({ id: 'l1', item_id: 'paddy', qty_kg: 100, godown_name: 'A' })],
  ]);
  const bad = validateInputAllocations({
    allocations: [{ lot_id: 'l1', quantity_base: 150 }],
    requiredTotalBase: 150,
    lotsById,
  });
  assert.equal(bad.ok, false);
}

// Mixed materials blocked.
{
  const lotsById = new Map([
    ['l1', lot({ id: 'l1', item_id: 'paddy', qty_kg: 100 })],
    ['l2', lot({ id: 'l2', item_id: 'rice', qty_kg: 100 })],
  ]);
  const bad = validateInputAllocations({
    allocations: [
      { lot_id: 'l1', quantity_base: 50 },
      { lot_id: 'l2', quantity_base: 50 },
    ],
    requiredTotalBase: 100,
    lotsById,
  });
  assert.equal(bad.ok, false);
}

// Zero allocation rejected.
{
  const lotsById = new Map([
    ['l1', lot({ id: 'l1', item_id: 'paddy', qty_kg: 100 })],
  ]);
  const bad = validateInputAllocations({
    allocations: [{ lot_id: 'l1', quantity_base: 0 }],
    requiredTotalBase: 100,
    lotsById,
  });
  assert.equal(bad.ok, false);
}

// Ten truck entries on one sauda still produce grouped stock, not duplicate purchase rows.
{
  const truckLots = Array.from({ length: 10 }, (_, index) =>
    lot({
      id: `truck-${index}`,
      item_id: 'paddy',
      sauda_id: 's-big',
      sauda_code: 'PUR-BIG',
      qty_kg: 1000,
      godown_name: `G${index % 3}`,
    }),
  );
  const groups = groupStockLots(truckLots);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].allocations.length, 10);
}

console.log('processing-input-tests: all assertions passed');
