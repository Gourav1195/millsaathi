import { buildStepProfile, loadChainRunDetail } from './chainRunExecution';
import { loadProcessingStockLots, type StockLotRow } from './stockLotProcessing';

type Recipe = { inputs: string[]; main: string; byproducts?: string[] };
const riceRecipes: Record<string, Recipe> = {
  'Pre-Cleaning': { inputs: ['$paddy'], main: 'Clean paddy' },
  'De-husking (Hulling)': { inputs: ['Clean paddy', 'Return paddy'], main: 'Brown rice', byproducts: ['Husk'] },
  'Paddy Separation': { inputs: ['Brown rice'], main: 'Separated brown rice', byproducts: ['Return paddy'] },
  'Whitening and Polishing': { inputs: ['Separated brown rice'], main: 'White rice', byproducts: ['Rice Bran'] },
  'Grading and Color Sorting': { inputs: ['White rice'], main: 'Graded rice', byproducts: ['Broken Rice'] },
  'Weighing and Packaging': { inputs: ['Graded rice'], main: 'Packed rice' },
};

// Only initialize untouched, built-in rice recipes. Configured custom recipes are authoritative.
export async function prepareRiceChain(db: D1Database, millId: string, chainId: string) {
  const mill = await db.prepare('SELECT mill_type FROM mills WHERE id = ?').bind(millId).first<{ mill_type: string }>();
  if (mill?.mill_type !== 'RICE') return;
  const types = await db.prepare(`SELECT DISTINCT p.id, p.name FROM processing_chain_steps s
    JOIN process_types p ON p.id = s.process_type_id AND p.mill_id = s.mill_id
    WHERE s.chain_id = ? AND s.mill_id = ? AND p.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM process_type_lines l WHERE l.process_type_id = p.id AND l.mill_id = p.mill_id AND l.active = 1)`)
    .bind(chainId, millId).all<{ id: string; name: string }>();
  for (const type of types.results) {
    const recipe = riceRecipes[type.name];
    if (!recipe) continue;
    const names = [...new Set([...recipe.inputs.filter((name) => name !== '$paddy'), recipe.main, ...(recipe.byproducts ?? [])])];
    const itemsByName = new Map<string, string>();
    const statements: D1PreparedStatement[] = [];
    for (const name of names) {
      const existing = await db.prepare(`SELECT id FROM items WHERE mill_id = ? AND LOWER(name) = LOWER(?) AND deleted_at IS NULL ORDER BY created_at, id`).bind(millId, name).all<{ id: string }>();
      if (existing.results.length > 1) throw new Error(`Multiple inventory items are named ${name}. Configure ${type.name} in All processes to choose the correct item.`);
      const id = existing.results[0]?.id ?? `rice-stage:${millId}:${name.toLowerCase().replaceAll(' ', '-')}`;
      if (!existing.results.length) {
        statements.push(db.prepare(`INSERT OR IGNORE INTO items (id, mill_id, name, category, category_code, unit, base_unit, display_unit)
          VALUES (?, ?, ?, ?, ?, 'Quintal', 'KG', 'QUINTAL')`).bind(id, millId, name, recipe.byproducts?.includes(name) ? 'byproduct' : 'rice', recipe.byproducts?.includes(name) ? 'BYPRODUCT' : 'FINISHED_GOOD'));
      }
      itemsByName.set(name, id);
    }
    const inputs = recipe.inputs.includes('$paddy')
      ? (await db.prepare(`SELECT id FROM items WHERE mill_id = ? AND category = 'paddy' AND deleted_at IS NULL ORDER BY id`).bind(millId).all<{ id: string }>()).results.map((item) => item.id)
      : recipe.inputs.map((name) => itemsByName.get(name)!);
    if (!inputs.length) continue;
    const insertLine = (itemId: string, kind: 'INPUT' | 'OUTPUT', semantic: string, index: number) => {
      statements.push(db.prepare(`INSERT OR IGNORE INTO process_type_lines
        (id, mill_id, process_type_id, line_type, semantic_type, item_id, default_unit, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, 'KG', ?)`)
        .bind(`rice-line:${type.id}:${kind}:${itemId}`, millId, type.id, kind, semantic, itemId, index));
    };
    inputs.forEach((id, index) => insertLine(id, 'INPUT', 'input', index));
    insertLine(itemsByName.get(recipe.main)!, 'OUTPUT', 'main', inputs.length);
    recipe.byproducts?.forEach((name, index) => insertLine(itemsByName.get(name)!, 'OUTPUT', 'byproduct', inputs.length + index + 1));
    await db.batch(statements);
  }
}

export type BatchLine = { id: string; item_id: string; item_name: string; kind: 'main' | 'byproduct'; expected_pct: number };
export type BatchStep = { id: string; step_number: number; process_type_id: string; name: string; inputs: { id: string; name: string }[]; outputs: BatchLine[]; configuration_error: string | null };
export async function loadBatchWorkspace(db: D1Database, millId: string, chainId: string) {
  const chain = await db.prepare(`SELECT id, name FROM processing_chains WHERE id = ? AND mill_id = ? AND deleted_at IS NULL AND active = 1`).bind(chainId, millId).first<{ id: string; name: string }>();
  if (!chain) throw new Error('Processing chain not found.');
  const steps = await db.prepare(`SELECT s.id, s.step_number, s.process_type_id, p.name FROM processing_chain_steps s
    JOIN process_types p ON p.id = s.process_type_id AND p.mill_id = s.mill_id
    WHERE s.chain_id = ? AND s.mill_id = ? AND p.deleted_at IS NULL ORDER BY s.step_number`).bind(chainId, millId).all<{ id: string; step_number: number; process_type_id: string; name: string }>();
  const recipes = await db.prepare(`SELECT l.*, i.name AS item_name, i.base_unit AS item_base_unit FROM process_type_lines l
    LEFT JOIN items i ON i.id = l.item_id AND i.mill_id = l.mill_id AND i.deleted_at IS NULL
    WHERE l.mill_id = ? AND l.active = 1`).bind(millId).all<Record<string, unknown>>();
  const configured: BatchStep[] = steps.results.map((step) => {
    const lines = recipes.results.filter((line) => line.process_type_id === step.process_type_id);
    const inputs = lines.filter((line) => line.line_type === 'INPUT' && line.item_name).map((line) => ({ id: String(line.item_id), name: String(line.item_name) }));
    const profile = buildStepProfile(step.name, lines);
    const outputLines = lines.filter((line) => line.line_type === 'OUTPUT');
    const outputs: BatchLine[] = outputLines.map((line) => ({ id: String(line.id), item_id: String(line.item_id ?? ''), item_name: String(line.item_name ?? 'Unmapped item'), kind: line.semantic_type === 'byproduct' ? 'byproduct' : 'main', expected_pct: Number(profile.lines.find((entry) => entry.itemId === line.item_id)?.pct ?? 0) }));
    const configuration_error = !inputs.length ? `${step.name}: configure accepted input items in All processes.`
      : outputs.filter((line) => line.kind === 'main').length !== 1 ? `${step.name}: configure exactly one main output item in All processes.`
      : outputLines.some((line) => !line.item_name) ? `${step.name}: an output inventory item is missing or archived.`
      : lines.some((line) => line.item_base_unit && line.item_base_unit !== 'KG') ? `${step.name}: this chain requires weight-based (KG) items.` : null;
    return { ...step, inputs, outputs, configuration_error };
  });
  const godowns = await db.prepare(`SELECT id, name FROM godowns WHERE mill_id = ? AND active = 1 ORDER BY name`).bind(millId).all<{ id: string; name: string }>();
  return { chain, steps: configured, lots: await loadProcessingStockLots(db, millId), godowns: godowns.results };
}

export type BatchSubmission = {
  completion_key: string;
  destination_godown_id: string;
  steps: { step_id: string; use_previous: boolean; allocations: { lot_id: string; quantity_base: number }[]; outputs: { line_id: string; quantity_base: number; godown_id?: string }[] }[];
};
type PlannedStep = { step: BatchStep; inputTotal: number; loss: number; main: number; byproduct: number; usePrevious: boolean; allocations: { lot: StockLotRow; quantity: number }[]; outputs: { line: BatchLine; quantity: number; godownId: string; lotId: string }[]; runStepId: string; processRunId: string };
const whole = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export async function completeBatch(db: D1Database, millId: string, userId: string, chainId: string, body: BatchSubmission, date: string, uuid: () => string) {
  if (!body || typeof body.completion_key !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(body.completion_key)) throw new Error('A valid completion key is required.');
  const duplicate = await db.prepare(`SELECT id, chain_id FROM processing_chain_runs WHERE mill_id = ? AND completion_key = ?`).bind(millId, body.completion_key).first<{ id: string; chain_id: string }>();
  if (duplicate) {
    if (duplicate.chain_id !== chainId) throw new Error('This completion key belongs to another chain.');
    return loadChainRunDetail(db, millId, duplicate.id);
  }
  const workspace = await loadBatchWorkspace(db, millId, chainId);
  if (!workspace.steps.length || workspace.steps.length > 30) throw new Error('A chain must have between 1 and 30 steps.');
  if (!Array.isArray(body.steps) || body.steps.length !== workspace.steps.length) throw new Error('Supply quantities for every step in this chain.');
  const godownIds = new Set(workspace.godowns.map((godown) => godown.id));
  if (!godownIds.has(body.destination_godown_id)) throw new Error('Choose a valid destination godown.');
  const lotMap = new Map(workspace.lots.map((lot) => [lot.id, lot]));
  const consumed = new Map<string, number>();
  const plans: PlannedStep[] = [];
  let previous: { itemId: string; quantity: number } | null = null;
  let totalExternal = 0;
  let retainedMain = 0;
  for (let index = 0; index < workspace.steps.length; index++) {
    const step = workspace.steps[index];
    const submitted = body.steps[index];
    if (!submitted || submitted.step_id !== step.id || !Array.isArray(submitted.allocations) || !Array.isArray(submitted.outputs) || typeof submitted.use_previous !== 'boolean') throw new Error('The chain changed. Reload and enter quantities again.');
    const allowed = new Set(step.inputs.map((item) => item.id));
    const seen = new Set<string>();
    const allocations = submitted.allocations.map((entry) => {
      if (!entry || !whole(entry.quantity_base) || entry.quantity_base <= 0 || seen.has(entry.lot_id)) throw new Error(`${step.name}: select each lot once with a positive whole-kilogram quantity.`);
      seen.add(entry.lot_id);
      const lot = lotMap.get(entry.lot_id);
      if (!lot || !allowed.has(lot.item_id)) throw new Error(`${step.name} does not accept this stock item.`);
      const total = (consumed.get(lot.id) ?? 0) + entry.quantity_base;
      if (total > lot.qty_kg) throw new Error(`${lot.code}: only ${lot.qty_kg} KG is available across the entire chain.`);
      consumed.set(lot.id, total);
      totalExternal += entry.quantity_base;
      return { lot, quantity: entry.quantity_base };
    });
    const previousQty = submitted.use_previous && previous ? previous.quantity : 0;
    if (previousQty && !allowed.has(previous!.itemId)) throw new Error(`${step.name} does not accept the previous step's output. Choose a compatible source.`);
    const inputTotal = allocations.reduce((sum, entry) => sum + entry.quantity, 0) + previousQty;
    if (inputTotal && step.configuration_error) throw new Error(step.configuration_error);
    if (submitted.outputs.length !== step.outputs.length || new Set(submitted.outputs.map((line) => line?.line_id)).size !== step.outputs.length) throw new Error(`${step.name}: enter every output quantity exactly once.`);
    const outputs = step.outputs.map((line) => {
      const value = submitted.outputs.find((entry) => entry?.line_id === line.id);
      if (!value || !whole(value.quantity_base)) throw new Error(`${step.name}: enter the actual ${line.item_name} quantity in whole kilograms (zero is allowed).`);
      const godownId = value.godown_id || body.destination_godown_id;
      if (!godownIds.has(godownId)) throw new Error(`${step.name}: choose a valid output godown.`);
      return { line, quantity: value.quantity_base, godownId, lotId: uuid() };
    });
    const outTotal = outputs.reduce((sum, entry) => sum + entry.quantity, 0);
    if (outTotal > inputTotal) throw new Error(`${step.name}: outputs (${outTotal} KG) exceed input (${inputTotal} KG).`);
    const main = outputs.filter((entry) => entry.line.kind === 'main').reduce((sum, entry) => sum + entry.quantity, 0);
    const byproduct = outTotal - main;
    retainedMain += main - previousQty;
    plans.push({ step, allocations, outputs, inputTotal, main, byproduct, loss: inputTotal - outTotal, usePrevious: previousQty > 0, runStepId: uuid(), processRunId: uuid() });
    previous = { itemId: outputs.find((entry) => entry.line.kind === 'main')?.line.item_id ?? '', quantity: main };
  }
  if (!totalExternal) throw new Error('Select stock for at least one process card.');
  // No stock/run writes occur before all steps have passed validation.
  const runId = uuid();
  const codeRow = await db.prepare(`INSERT INTO counters(mill_id, key, value) VALUES (?, 'chain_run', 1) ON CONFLICT(mill_id,key) DO UPDATE SET value=value+1 RETURNING value`).bind(millId).first<{ value: number }>();
  const code = `CHN-${codeRow!.value}`;
  const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO processing_chain_runs
    (id,mill_id,chain_id,code,status,start_date,started_at,end_date,unit,planned_input_base,total_input_base,total_output_base,total_loss_base,total_byproduct_base,created_by,completion_key)
    VALUES (?,?,?,?,'COMPLETED',?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?,'KG',?,?,?,?,?,?,?)`)
    .bind(runId,millId,chainId,code,date,date,totalExternal,totalExternal,retainedMain,plans.reduce((sum,p)=>sum+p.loss,0),plans.reduce((sum,p)=>sum+p.byproduct,0),userId,body.completion_key)];
  let previousMain: { lotId: string; itemId: string; quantity: number; godownId: string } | null = null;
  let lotNumber = 0;
  for (const plan of plans) {
    const { step, runStepId, processRunId } = plan;
    statements.push(db.prepare(`INSERT INTO processing_chain_run_steps (id,mill_id,chain_run_id,step_number,process_type_id,process_type_name,source_chain_step_id,status,forecast_input_base,forecast_main_base,actual_input_base,actual_main_base)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(runStepId,millId,runId,step.step_number,step.process_type_id,step.name,step.id,plan.inputTotal ? 'COMPLETED' : 'SKIPPED',plan.inputTotal,plan.main,plan.inputTotal,plan.main));
    if (!plan.inputTotal) { previousMain = null; continue; }
    statements.push(db.prepare(`INSERT INTO process_runs (id,mill_id,process_type_id,run_date,operator_id,destination_godown_id,notes,created_by,chain_run_id,chain_step_id,chain_run_step_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(processRunId,millId,step.process_type_id,date,userId,body.destination_godown_id,`Whole chain ${code}`,userId,runId,step.id,runStepId));
    statements.push(db.prepare(`UPDATE processing_chain_run_steps SET process_run_id = ? WHERE id = ? AND mill_id = ?`).bind(processRunId,runStepId,millId));
    const insertLine = (kind: 'INPUT'|'OUTPUT'|'LOSS', semantic: string, itemId: string, lotId: string|null, quantity: number, godownId: string|null, templateId: string|null = null) => {
      statements.push(db.prepare(`INSERT INTO process_run_lines (id,mill_id,run_id,line_type,item_id,lot_id,quantity,unit,quantity_base,base_unit,godown_id,semantic_type,template_line_id)
        VALUES (?,?,?,?,?,?,?,'KG',?,'KG',?,?,?)`).bind(uuid(),millId,processRunId,kind,itemId,lotId,quantity,quantity,godownId,semantic,templateId));
      if (kind !== 'LOSS') statements.push(db.prepare(`INSERT INTO stock_movements (id,mill_id,direction,item_id,godown_id,lot_id,quantity,unit,quantity_base,base_unit,source_type,source_id,created_by,movement_date)
        VALUES (?,?,?,?,?,?,?,'KG',?,'KG','PROCESS_RUN',?,?,?)`).bind(uuid(),millId,kind === 'INPUT' ? 'OUT' : 'IN',itemId,godownId,lotId,quantity,quantity,processRunId,userId,date));
    };
    const inputs = plan.allocations.map(({ lot, quantity }) => ({ lotId: lot.id, itemId: lot.item_id, quantity, godownId: lot.godown_id ?? null, saudaId: lot.sauda_id ?? null, gateId: lot.gate_entry_id ?? null }));
    if (plan.usePrevious && previousMain) inputs.push({ ...previousMain, saudaId: null, gateId: null });
    for (const source of inputs) {
      statements.push(db.prepare(`UPDATE lots SET qty_kg=qty_kg-?,consumed_qty_kg=consumed_qty_kg+?,allocation_status=CASE WHEN qty_kg-?=0 THEN 'consumed' ELSE 'partially_available' END WHERE id=? AND mill_id=?`).bind(source.quantity,source.quantity,source.quantity,source.lotId,millId));
      insertLine('INPUT','input',source.itemId,source.lotId,source.quantity,source.godownId);
      statements.push(db.prepare(`INSERT INTO processing_input_consumptions (id,mill_id,chain_run_id,chain_run_step_id,process_run_id,lot_id,sauda_id,gate_entry_id,item_id,godown_id,quantity_base,idempotency_key)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uuid(),millId,runId,runStepId,processRunId,source.lotId,source.saudaId,source.gateId,source.itemId,source.godownId,source.quantity,`${runStepId}:${source.lotId}`));
    }
    previousMain = null;
    for (const output of plan.outputs) {
      if (output.quantity > 0) {
        statements.push(db.prepare(`INSERT INTO lots (id,mill_id,code,godown_id,item_id,qty_kg,received_qty_kg,in_date,note) VALUES (?,?,?,?,?,?,?,?,?)`)
          .bind(output.lotId,millId,`${code}-OUT-${++lotNumber}`,output.godownId,output.line.item_id,output.quantity,output.quantity,date,`${code} · ${step.name}`));
        insertLine('OUTPUT',output.line.kind,output.line.item_id,output.lotId,output.quantity,output.godownId,output.line.id);
        if (output.line.kind === 'main') previousMain = { lotId: output.lotId, itemId: output.line.item_id, quantity: output.quantity, godownId: output.godownId };
      }
      statements.push(db.prepare(`INSERT INTO processing_chain_run_step_lines (id,mill_id,run_step_id,kind,item_id,item_name,expected_pct,forecast_base,actual_base,godown_id,lot_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(uuid(),millId,runStepId,output.line.kind,output.line.item_id,output.line.item_name,output.line.expected_pct,output.quantity,output.quantity,output.godownId,output.quantity > 0 ? output.lotId : null));
    }
    if (plan.loss > 0) insertLine('LOSS','waste',inputs[0].itemId,null,plan.loss,null);
    statements.push(db.prepare(`INSERT INTO processing_chain_run_step_lines (id,mill_id,run_step_id,kind,item_name,forecast_base,actual_base) VALUES (?,?,?,'loss','Measured loss',?,?)`).bind(uuid(),millId,runStepId,plan.loss,plan.loss));
  }
  try { await db.batch(statements); }
  catch (cause) {
    const retry = await db.prepare(`SELECT id FROM processing_chain_runs WHERE mill_id = ? AND completion_key = ?`).bind(millId,body.completion_key).first<{id:string}>();
    if (retry) return loadChainRunDetail(db,millId,retry.id);
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/insufficient quantity|UNIQUE constraint/i.test(message)) throw new Error('Stock changed while completing. Refresh availability and try again; no part of this chain was posted.');
    throw cause;
  }
  return loadChainRunDetail(db,millId,runId);
}
