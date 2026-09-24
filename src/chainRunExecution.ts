// Chain run execution helpers: yield profiles, forecast seeding, process run posting.

export type ClassicYieldLine = {
  kind: 'main' | 'byproduct' | 'loss';
  name: string;
  pct: number;
  minPct?: number;
  maxPct?: number;
  itemId?: string | null;
};

export type ClassicStepProfile = {
  detail: string;
  mainProduct: string;
  lines: ClassicYieldLine[];
};

function profileFromParts(detail: string, mainProduct: string, lines: ClassicYieldLine[]): ClassicStepProfile {
  const total = lines.reduce((sum, line) => sum + line.pct, 0);
  if (total !== 100 && lines.length) {
    const lossIndex = lines.findIndex((line) => line.kind === 'loss');
    const delta = 100 - total;
    if (lossIndex >= 0) lines[lossIndex] = { ...lines[lossIndex], pct: Math.max(0, lines[lossIndex].pct + delta) };
    else lines.push({ kind: 'loss', name: 'Expected loss', pct: Math.max(0, delta) });
  }
  return { detail, mainProduct, lines };
}

function profileFromProcessName(name: string): ClassicStepProfile {
  const key = String(name || '').toLowerCase();
  if (key.includes('pre-clean')) {
    return profileFromParts('Removes dust, stones and foreign matter.', 'Clean paddy', [
      { kind: 'main', name: 'Clean paddy', pct: 98, minPct: 96, maxPct: 99 },
      { kind: 'loss', name: 'Impurities', pct: 2, minPct: 1, maxPct: 4 },
    ]);
  }
  if (key.includes('de-husk') || key.includes('hulling')) {
    return profileFromParts('Separates husk from paddy to produce brown rice.', 'Brown rice', [
      { kind: 'main', name: 'Brown rice', pct: 78, minPct: 75, maxPct: 80 },
      { kind: 'byproduct', name: 'Husk', pct: 20, minPct: 18, maxPct: 22 },
      { kind: 'loss', name: 'Milling loss', pct: 2, minPct: 1, maxPct: 3 },
    ]);
  }
  if (key.includes('separation')) {
    return profileFromParts('Separates remaining paddy from brown rice.', 'Separated brown rice', [
      { kind: 'main', name: 'Separated brown rice', pct: 97, minPct: 95, maxPct: 98 },
      { kind: 'byproduct', name: 'Return paddy', pct: 2, minPct: 1, maxPct: 3 },
      { kind: 'loss', name: 'Separation loss', pct: 1, minPct: 0.5, maxPct: 2 },
    ]);
  }
  if (key.includes('whiten') || key.includes('polish')) {
    return profileFromParts('Whitening and polishing produces finished white rice.', 'White rice', [
      { kind: 'main', name: 'White rice', pct: 89, minPct: 86, maxPct: 92 },
      { kind: 'byproduct', name: 'Rice bran', pct: 8, minPct: 6, maxPct: 10 },
      { kind: 'loss', name: 'Expected loss', pct: 3, minPct: 2, maxPct: 4 },
    ]);
  }
  if (key.includes('grad') || key.includes('color')) {
    return profileFromParts('Grades rice and removes broken or discoloured grain.', 'Graded rice', [
      { kind: 'main', name: 'Graded rice', pct: 96, minPct: 94, maxPct: 98 },
      { kind: 'byproduct', name: 'Broken rice', pct: 3, minPct: 2, maxPct: 5 },
      { kind: 'loss', name: 'Expected loss', pct: 1, minPct: 0.5, maxPct: 2 },
    ]);
  }
  if (key.includes('pack') || key.includes('weigh')) {
    return profileFromParts('Weighs and packs the finished rice.', 'Packed rice', [
      { kind: 'main', name: 'Packed rice', pct: 100, minPct: 99, maxPct: 100 },
    ]);
  }
  return profileFromParts('Editable process yield profile.', 'Main output', [
    { kind: 'main', name: 'Main output', pct: 95, minPct: 90, maxPct: 98 },
    { kind: 'loss', name: 'Expected loss', pct: 5, minPct: 2, maxPct: 10 },
  ]);
}

export function buildStepProfile(
  processName: string,
  templateLines: Record<string, unknown>[],
): ClassicStepProfile {
  const base = profileFromProcessName(processName);
  if (!templateLines.length) return base;

  const mainLine = templateLines.find((line) => line.line_type === 'OUTPUT' && line.semantic_type === 'main');
  const byproductLines = templateLines.filter((line) => line.line_type === 'OUTPUT' && line.semantic_type === 'byproduct');
  const lossLines = templateLines.filter((line) => line.line_type === 'LOSS' || line.semantic_type === 'waste');

  const lines: ClassicYieldLine[] = [];
  const mainPct = base.lines.find((line) => line.kind === 'main')?.pct ?? 95;
  const byproductBase = base.lines.filter((line) => line.kind === 'byproduct');
  const lossPct = base.lines.find((line) => line.kind === 'loss')?.pct ?? Math.max(0, 100 - mainPct - byproductBase.reduce((sum, line) => sum + line.pct, 0));

  const mainTemplate = mainLine as Record<string, unknown> | undefined;
  lines.push({
    kind: 'main',
    name: String(mainTemplate?.item_name ?? base.mainProduct),
    pct: mainPct,
    minPct: mainTemplate?.expected_yield_min_pct != null ? Number(mainTemplate.expected_yield_min_pct) : base.lines.find((l) => l.kind === 'main')?.minPct,
    maxPct: mainTemplate?.expected_yield_max_pct != null ? Number(mainTemplate.expected_yield_max_pct) : base.lines.find((l) => l.kind === 'main')?.maxPct,
    itemId: mainTemplate?.item_id ? String(mainTemplate.item_id) : null,
  });

  if (byproductLines.length) {
    byproductLines.forEach((line, index) => {
      const fallback = byproductBase[index] ?? byproductBase[0];
      const share = byproductBase.length ? (fallback?.pct ?? 0) : 0;
      lines.push({
        kind: 'byproduct',
        name: String(line.item_name ?? fallback?.name ?? 'By-product'),
        pct: share || Math.round((100 - mainPct - lossPct) / byproductLines.length),
        minPct: line.expected_yield_min_pct != null ? Number(line.expected_yield_min_pct) : fallback?.minPct,
        maxPct: line.expected_yield_max_pct != null ? Number(line.expected_yield_max_pct) : fallback?.maxPct,
        itemId: line.item_id ? String(line.item_id) : null,
      });
    });
  } else {
    byproductBase.forEach((line) => lines.push(line));
  }

  if (lossLines.length) {
    const lossLine = lossLines[0];
    lines.push({
      kind: 'loss',
      name: String(lossLine.item_name ?? 'Expected loss'),
      pct: lossPct,
      minPct: lossLine.expected_yield_min_pct != null ? Number(lossLine.expected_yield_min_pct) : undefined,
      maxPct: lossLine.expected_yield_max_pct != null ? Number(lossLine.expected_yield_max_pct) : undefined,
      itemId: lossLine.item_id ? String(lossLine.item_id) : null,
    });
  } else {
    const lossLine = base.lines.find((line) => line.kind === 'loss');
    if (lossLine) lines.push(lossLine);
  }

  const total = lines.reduce((sum, line) => sum + line.pct, 0);
  if (total !== 100) {
    return profileFromParts(base.detail, lines[0]?.name ?? base.mainProduct, lines);
  }
  return { detail: base.detail, mainProduct: lines[0]?.name ?? base.mainProduct, lines };
}

export function roundClassicQty(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function computeForecastForSteps(
  steps: { id: string; inputQty: number; profile: ClassicStepProfile }[],
): { stepId: string; inputQty: number; mainQty: number; lines: { kind: string; name: string; qty: number; pct: number; minPct?: number; maxPct?: number; itemId?: string | null }[] }[] {
  let inputQty = steps[0]?.inputQty ?? 0;
  return steps.map((step) => {
    const mainLine = step.profile.lines.find((line) => line.kind === 'main');
    const mainPct = mainLine?.pct ?? 100;
    const mainQty = roundClassicQty(inputQty * mainPct / 100);
    const lines = step.profile.lines.map((line) => ({
      kind: line.kind,
      name: line.name,
      pct: line.pct,
      minPct: line.minPct,
      maxPct: line.maxPct,
      itemId: line.itemId,
      qty: roundClassicQty(inputQty * line.pct / 100),
    }));
    const result = { stepId: step.id, inputQty: roundClassicQty(inputQty), mainQty, lines };
    inputQty = mainQty;
    return result;
  });
}

export type PreparedProcessLine = {
  line: Record<string, unknown>;
  q: { quantity: number; unit: string; base: number; baseUnit: string };
  lotId: string | null;
  godownId: string | null;
  lotCode?: string;
};

export type PostProcessRunInput = {
  db: D1Database;
  millId: string;
  userId: string;
  processTypeId: string;
  runDate: string;
  shift: string | null;
  operatorId: string;
  sourceLotId: string | null;
  destinationGodownId: string | null;
  notes: string | null;
  chainRunId?: string | null;
  chainStepId?: string | null;
  chainRunStepId?: string | null;
  idempotencyKey?: string | null;
  lines: Record<string, unknown>[];
  lotNote?: string;
};

export type PostProcessRunResult =
  | { ok: true; runId: string; preparedLines: PreparedProcessLine[]; stepInputTotal: number; stepOutputTotal: number; stepLossTotal: number; stepByproductTotal: number }
  | { ok: false; status: number; error: string };

export async function postProcessRunLines(
  input: PostProcessRunInput,
  deps: {
    uuid: () => string;
    nextCode: (db: D1Database, millId: string, key: string, prefix: string) => Promise<string>;
    normalizeItemQuantity: (db: D1Database, millId: string, itemId: unknown, quantity: unknown, unit: unknown) => Promise<{ quantity: number; unit: string; base: number; baseUnit: string } | null>;
    validatePreviousStepLots?: (inputLotIds: string[]) => Promise<string | null>;
  },
): Promise<PostProcessRunResult> {
  const { db, millId, userId, processTypeId, lines: rawLines } = input;
  const lines = [...rawLines];
  const processTypeConfig = await db.prepare(`SELECT default_unit, default_destination_godown_id FROM process_types WHERE id = ? AND mill_id = ?`).bind(processTypeId, millId).first<{ default_unit: string | null; default_destination_godown_id: string | null }>();
  const templateLines = await db.prepare(`SELECT * FROM process_type_lines WHERE process_type_id = ? AND mill_id = ? AND active = 1 ORDER BY sort_order, created_at`).bind(processTypeId, millId).all<Record<string, unknown>>();
  const templateById = new Map(templateLines.results.map((line) => [String(line.id), line]));
  const inferredLines = lines.map((rawLine) => {
    const line = { ...rawLine };
    const template = rawLine.template_line_id ? templateById.get(String(rawLine.template_line_id)) : undefined;
    if (template) {
      if (!line.item_id) line.item_id = template.item_id;
      if (!line.unit) line.unit = template.default_unit || processTypeConfig?.default_unit || undefined;
      if (!line.godown_id && template.default_godown_id) line.godown_id = template.default_godown_id;
      if (!line.semantic_type) line.semantic_type = template.semantic_type;
    }
    if (!line.item_id && String(line.lot_id ?? '')) line.item_id = '__LOT__';
    return line;
  });
  for (const line of inferredLines) {
    if (line.item_id === '__LOT__' && line.lot_id) {
      const lotItem = await db.prepare(`SELECT item_id FROM lots WHERE id = ? AND mill_id = ?`).bind(line.lot_id, millId).first<{ item_id: string | null }>();
      line.item_id = lotItem?.item_id || '';
    }
  }
  lines.splice(0, lines.length, ...inferredLines);
  const defaultDestinationGodown = input.destinationGodownId || processTypeConfig?.default_destination_godown_id || '';
  const operatorId = input.operatorId;
  if (!await db.prepare(`SELECT id FROM users WHERE id = ? AND mill_id = ? AND active = 1`).bind(operatorId, millId).first()) {
    return { ok: false, status: 400, error: 'operator not found' };
  }
  const sourceLotId = input.sourceLotId ?? '';
  const inputLines = lines.filter((entry) => entry.line_type === 'INPUT');
  if (sourceLotId && inputLines.length !== 1) return { ok: false, status: 400, error: 'source_lot_id requires exactly one input line' };
  if (sourceLotId && !inputLines[0].lot_id) inputLines[0].lot_id = sourceLotId;
  if (input.idempotencyKey && input.chainRunStepId) {
    const duplicate = await db.prepare(
      `SELECT id FROM process_runs WHERE mill_id = ? AND chain_run_step_id = ? AND status = 'POSTED' LIMIT 1`,
    ).bind(millId, input.chainRunStepId).first();
    if (duplicate) return { ok: false, status: 409, error: 'this processing step was already posted' };
  }
  if (deps.validatePreviousStepLots) {
    const inputLotIds = inputLines.map((line) => String(line.lot_id ?? '')).filter(Boolean);
    const chainError = await deps.validatePreviousStepLots(inputLotIds);
    if (chainError) return { ok: false, status: 409, error: chainError };
  }
  const linkedSourceLotId = sourceLotId || (inputLines.length === 1 ? String(inputLines[0].lot_id ?? '') : '');
  if (linkedSourceLotId && !await db.prepare(`SELECT id FROM lots WHERE id = ? AND mill_id = ?`).bind(linkedSourceLotId, millId).first()) {
    return { ok: false, status: 400, error: 'source lot not found' };
  }
  const itemIds = lines.map((line) => String(line.item_id ?? '')).filter(Boolean);
  if (!itemIds.length) return { ok: false, status: 400, error: 'each process line needs an item or a resolvable source lot' };
  const uniqueItemIds = [...new Set(itemIds)];
  const validItems = await db.prepare(`SELECT COUNT(*) AS count FROM items WHERE mill_id = ? AND deleted_at IS NULL AND id IN (${itemIds.map(() => '?').join(',')})`).bind(millId, ...itemIds).first<{ count: number }>();
  if (!validItems || validItems.count !== uniqueItemIds.length) return { ok: false, status: 400, error: 'one or more items were not found' };
  const godownIds = [defaultDestinationGodown, ...lines.map((line) => String(line.godown_id ?? ''))].filter(Boolean);
  if (godownIds.length) {
    const godownCount = await db.prepare(`SELECT COUNT(*) AS count FROM godowns WHERE mill_id = ? AND active = 1 AND id IN (${godownIds.map(() => '?').join(',')})`).bind(millId, ...godownIds).first<{ count: number }>();
    if (!godownCount || godownCount.count !== new Set(godownIds).size) return { ok: false, status: 400, error: 'one or more process godowns were not found' };
  }
  const normalizedLines = await Promise.all(lines.map(async (line) => ({ line, q: await deps.normalizeItemQuantity(db, millId, line.item_id, line.quantity, line.unit) })));
  if (!normalizedLines.every(({ line, q }) => ['INPUT', 'OUTPUT', 'LOSS'].includes(String(line.line_type)) && !!String(line.item_id ?? '') && !!q && q.base > 0)) {
    return { ok: false, status: 400, error: 'each process line needs a valid positive item quantity and unit' };
  }
  const inputTotal = normalizedLines.filter(({ line }) => line.line_type === 'INPUT').reduce((total, entry) => total + entry.q!.base, 0);
  const accountedTotal = normalizedLines.filter(({ line }) => line.line_type === 'OUTPUT' || line.line_type === 'LOSS').reduce((total, entry) => total + entry.q!.base, 0);
  if (accountedTotal > inputTotal + 0.000001) return { ok: false, status: 400, error: 'total outputs and measured loss cannot exceed total input quantity' };
  const inputLotGodowns = new Map<string, string | null>();
  for (const line of inputLines) {
    const q = normalizedLines.find((entry) => entry.line === line)!.q!;
    if (line.lot_id && !Number.isInteger(q.base)) return { ok: false, status: 400, error: 'source lot quantities must normalize to whole kilograms' };
    const available = await db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN quantity_base WHEN direction = 'OUT' THEN -quantity_base ELSE quantity_base END),0) AS quantity FROM stock_movements WHERE mill_id = ? AND item_id = ? AND status = 'POSTED'`).bind(millId, line.item_id).first<{ quantity: number }>();
    if ((available?.quantity || 0) < q.base) return { ok: false, status: 400, error: `insufficient posted stock for item ${line.item_id}` };
    if (line.lot_id) {
      const lot = await db.prepare(
        `SELECT id, item_id, qty_kg, godown_id, sauda_id, gate_entry_id FROM lots WHERE id = ? AND mill_id = ?`,
      ).bind(line.lot_id, millId).first<{ id: string; item_id: string | null; qty_kg: number; godown_id: string | null; sauda_id: string | null; gate_entry_id: string | null }>();
      if (!lot || lot.item_id !== line.item_id || lot.qty_kg < q.base) return { ok: false, status: 400, error: `insufficient quantity in source lot ${line.lot_id}` };
      inputLotGodowns.set(String(line.lot_id), lot.godown_id);
    }
  }
  const runId = deps.uuid();
  const preparedLines: PreparedProcessLine[] = [];
  for (const { line, q: normalized } of normalizedLines) {
    const q = normalized!;
    let lotId = String(line.lot_id ?? '') || null;
    const godownId = line.line_type === 'INPUT' && lotId ? (inputLotGodowns.get(lotId) ?? null) : String(line.godown_id ?? defaultDestinationGodown ?? '') || null;
    if (line.line_type === 'OUTPUT' && godownId) {
      if (!Number.isInteger(q.base)) return { ok: false, status: 400, error: 'output quantities assigned to lots must normalize to whole kilograms' };
      lotId = deps.uuid();
      preparedLines.push({ line, q, lotId, godownId, lotCode: await deps.nextCode(db, millId, 'lot', 'LOT') });
    } else {
      preparedLines.push({ line, q, lotId, godownId });
    }
  }
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO process_runs (id, mill_id, process_type_id, run_date, shift, operator_id, source_lot_id, destination_godown_id, notes, created_by, chain_run_id, chain_step_id, chain_run_step_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(runId, millId, processTypeId, input.runDate, input.shift, operatorId, linkedSourceLotId || null, defaultDestinationGodown || null, input.notes, userId, input.chainRunId ?? null, input.chainStepId ?? null, input.chainRunStepId ?? null),
  ];
  let stepInputTotal = 0;
  let stepOutputTotal = 0;
  let stepLossTotal = 0;
  let stepByproductTotal = 0;
  const lotNote = input.lotNote ?? `Created by process run ${runId}`;
  for (const prepared of preparedLines) {
    const line = prepared.line;
    const q = prepared.q;
    if (prepared.lotCode) {
      statements.push(db.prepare(`INSERT INTO lots (id, mill_id, code, godown_id, item_id, qty_kg, received_qty_kg, in_date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(prepared.lotId, millId, prepared.lotCode, prepared.godownId, line.item_id, Math.round(q.base), Math.round(q.base), input.runDate, lotNote));
    }
    if (line.line_type === 'INPUT' && prepared.lotId) {
      const roundedBase = Math.round(q.base);
      statements.push(db.prepare(
        `UPDATE lots SET qty_kg = qty_kg - ?, consumed_qty_kg = COALESCE(consumed_qty_kg, 0) + ?,
         allocation_status = CASE WHEN qty_kg - ? <= 0 THEN 'consumed' ELSE 'partially_available' END
         WHERE id = ? AND mill_id = ?`,
      ).bind(roundedBase, roundedBase, roundedBase, prepared.lotId, millId));
      if (input.chainRunStepId) {
        const lotMeta = await db.prepare(
          `SELECT sauda_id, gate_entry_id, godown_id FROM lots WHERE id = ? AND mill_id = ?`,
        ).bind(prepared.lotId, millId).first<{ sauda_id: string | null; gate_entry_id: string | null; godown_id: string | null }>();
        statements.push(db.prepare(
          `INSERT INTO processing_input_consumptions
           (id, mill_id, chain_run_id, chain_run_step_id, process_run_id, lot_id, sauda_id, gate_entry_id, item_id, godown_id, quantity_base, idempotency_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          deps.uuid(), millId, input.chainRunId ?? null, input.chainRunStepId, runId, prepared.lotId,
          lotMeta?.sauda_id ?? null, lotMeta?.gate_entry_id ?? null, line.item_id, lotMeta?.godown_id ?? prepared.godownId,
          roundedBase, input.idempotencyKey ? `${input.idempotencyKey}:${prepared.lotId}` : null,
        ));
      }
    }
    statements.push(db.prepare(`INSERT INTO process_run_lines (id, mill_id, run_id, line_type, item_id, lot_id, quantity, unit, quantity_base, base_unit, godown_id, semantic_type, template_line_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(deps.uuid(), millId, runId, line.line_type, line.item_id, prepared.lotId, q.quantity, q.unit, q.base, q.baseUnit, prepared.godownId, String(line.semantic_type ?? (line.line_type === 'INPUT' ? 'input' : line.line_type === 'LOSS' ? 'waste' : 'main')), String(line.template_line_id ?? '') || null));
    if (line.line_type !== 'LOSS') {
      statements.push(db.prepare(`INSERT INTO stock_movements (id, mill_id, direction, item_id, godown_id, lot_id, quantity, unit, quantity_base, base_unit, source_type, source_id, created_by, movement_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESS_RUN', ?, ?, ?)`)
        .bind(deps.uuid(), millId, line.line_type === 'OUTPUT' ? 'IN' : 'OUT', line.item_id, prepared.godownId, prepared.lotId, q.quantity, q.unit, q.base, q.baseUnit, runId, userId, input.runDate));
    }
    if (line.line_type === 'INPUT') stepInputTotal += q.base;
    else if (line.line_type === 'OUTPUT') {
      if (String(line.semantic_type ?? '') === 'byproduct') stepByproductTotal += q.base;
      else stepOutputTotal += q.base;
    } else if (line.line_type === 'LOSS') stepLossTotal += q.base;
  }
  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/insufficient quantity|UNIQUE constraint failed/i.test(message)) {
      return { ok: false, status: 409, error: 'Stock changed or this step was already posted. Refresh the run before trying again.' };
    }
    throw error;
  }
  return { ok: true, runId, preparedLines, stepInputTotal, stepOutputTotal, stepLossTotal, stepByproductTotal };
}

export async function materializeChainRunSteps(
  db: D1Database,
  millId: string,
  chainRunId: string,
  chainId: string,
  plannedInputBase: number,
  uuid: () => string,
) {
  const templateSteps = await db.prepare(
    `SELECT cs.*, pt.name AS process_type_name
     FROM processing_chain_steps cs
     LEFT JOIN process_types pt ON pt.id = cs.process_type_id
     WHERE cs.chain_id = ? AND cs.mill_id = ?
     ORDER BY cs.step_number`,
  ).bind(chainId, millId).all<Record<string, unknown>>();
  const processTypeIds = templateSteps.results.map((s) => String(s.process_type_id));
  const templateLines = processTypeIds.length
    ? await db.prepare(`SELECT * FROM process_type_lines WHERE mill_id = ? AND process_type_id IN (${processTypeIds.map(() => '?').join(',')}) AND active = 1 ORDER BY process_type_id, sort_order, created_at`).bind(millId, ...processTypeIds).all<Record<string, unknown>>()
    : { results: [] as Record<string, unknown>[] };
  const linesByType = new Map<string, Record<string, unknown>[]>();
  for (const line of templateLines.results) {
    const key = String(line.process_type_id);
    linesByType.set(key, [...(linesByType.get(key) || []), line]);
  }

  const runSteps: { id: string; stepNumber: number; profile: ClassicStepProfile }[] = [];
  const statements: D1PreparedStatement[] = [];
  for (const step of templateSteps.results) {
    const runStepId = uuid();
    const profile = buildStepProfile(String(step.process_type_name ?? ''), linesByType.get(String(step.process_type_id)) || []);
    runSteps.push({ id: runStepId, stepNumber: Number(step.step_number), profile });
    statements.push(db.prepare(
      `INSERT INTO processing_chain_run_steps (id, mill_id, chain_run_id, step_number, process_type_id, process_type_name, source_chain_step_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    ).bind(runStepId, millId, chainRunId, step.step_number, step.process_type_id, step.process_type_name, step.id));
  }

  let inputKg = plannedInputBase;
  for (let index = 0; index < runSteps.length; index++) {
    const step = runSteps[index];
    const profile = step.profile;
    const mainPct = profile.lines.find((l) => l.kind === 'main')?.pct ?? 100;
    const mainQty = roundClassicQty(inputKg * mainPct / 100);
    statements.push(db.prepare(
      `UPDATE processing_chain_run_steps SET forecast_input_base = ?, forecast_main_base = ? WHERE id = ? AND mill_id = ?`,
    ).bind(roundClassicQty(inputKg), mainQty, step.id, millId));
    for (const line of profile.lines) {
      const lineId = uuid();
      statements.push(db.prepare(
        `INSERT INTO processing_chain_run_step_lines (id, mill_id, run_step_id, kind, item_id, item_name, expected_pct, expected_min_pct, expected_max_pct, forecast_base)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        lineId, millId, step.id, line.kind, line.itemId ?? null, line.name,
        line.pct, line.minPct ?? null, line.maxPct ?? null,
        roundClassicQty(inputKg * line.pct / 100),
      ));
    }
    inputKg = mainQty;
  }

  await db.batch(statements);
  return runSteps;
}

export async function loadChainRunDetail(db: D1Database, millId: string, chainRunId: string) {
  const run = await db.prepare(
    `SELECT cr.*, pc.name AS chain_name FROM processing_chain_runs cr
     LEFT JOIN processing_chains pc ON pc.id = cr.chain_id
     WHERE cr.id = ? AND cr.mill_id = ?`,
  ).bind(chainRunId, millId).first<Record<string, unknown>>();
  if (!run) return null;

  const runSteps = await db.prepare(
    `SELECT * FROM processing_chain_run_steps WHERE chain_run_id = ? AND mill_id = ? ORDER BY step_number`,
  ).bind(chainRunId, millId).all<Record<string, unknown>>();

  const stepIds = runSteps.results.map((s) => String(s.id));
  const stepLines = stepIds.length
    ? await db.prepare(
      `SELECT l.*, lo.code AS lot_code, g.name AS godown_name
       FROM processing_chain_run_step_lines l
       LEFT JOIN lots lo ON lo.id = l.lot_id
       LEFT JOIN godowns g ON g.id = l.godown_id
       WHERE l.mill_id = ? AND l.run_step_id IN (${stepIds.map(() => '?').join(',')})
       ORDER BY l.run_step_id, l.kind, l.item_name`,
    ).bind(millId, ...stepIds).all<Record<string, unknown>>()
    : { results: [] as Record<string, unknown>[] };

  const linesByStep = new Map<string, Record<string, unknown>[]>();
  for (const line of stepLines.results) {
    const key = String(line.run_step_id);
    linesByStep.set(key, [...(linesByStep.get(key) || []), line]);
  }

  return {
    chain_run: run,
    input_allocations: JSON.parse(String(run.input_allocations_json ?? '[]')),
    run_steps: runSteps.results.map((step) => ({
      ...step,
      lines: linesByStep.get(String(step.id)) || [],
    })),
  };
}

export async function recomputeDraftForecasts(
  db: D1Database,
  millId: string,
  chainRunId: string,
  plannedInputBase: number,
  uuid: () => string,
) {
  const steps = await db.prepare(
    `SELECT id, step_number, process_type_id, process_type_name FROM processing_chain_run_steps
     WHERE chain_run_id = ? AND mill_id = ? ORDER BY step_number`,
  ).bind(chainRunId, millId).all<Record<string, unknown>>();

  const processTypeIds = steps.results.map((s) => String(s.process_type_id));
  const templateLines = processTypeIds.length
    ? await db.prepare(`SELECT * FROM process_type_lines WHERE mill_id = ? AND process_type_id IN (${processTypeIds.map(() => '?').join(',')}) AND active = 1`).bind(millId, ...processTypeIds).all<Record<string, unknown>>()
    : { results: [] as Record<string, unknown>[] };
  const linesByType = new Map<string, Record<string, unknown>[]>();
  for (const line of templateLines.results) {
    const key = String(line.process_type_id);
    linesByType.set(key, [...(linesByType.get(key) || []), line]);
  }

  const statements: D1PreparedStatement[] = [
    db.prepare(`DELETE FROM processing_chain_run_step_lines WHERE mill_id = ? AND run_step_id IN (SELECT id FROM processing_chain_run_steps WHERE chain_run_id = ? AND mill_id = ?)`).bind(millId, chainRunId, millId),
  ];

  let inputKg = plannedInputBase;
  for (const step of steps.results) {
    const profile = buildStepProfile(String(step.process_type_name ?? ''), linesByType.get(String(step.process_type_id)) || []);
    const mainPct = profile.lines.find((l) => l.kind === 'main')?.pct ?? 100;
    const mainQty = roundClassicQty(inputKg * mainPct / 100);
    statements.push(db.prepare(
      `UPDATE processing_chain_run_steps SET forecast_input_base = ?, forecast_main_base = ? WHERE id = ? AND mill_id = ?`,
    ).bind(roundClassicQty(inputKg), mainQty, step.id, millId));
    for (const line of profile.lines) {
      statements.push(db.prepare(
        `INSERT INTO processing_chain_run_step_lines (id, mill_id, run_step_id, kind, item_id, item_name, expected_pct, expected_min_pct, expected_max_pct, forecast_base)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        uuid(), millId, step.id, line.kind, line.itemId ?? null, line.name,
        line.pct, line.minPct ?? null, line.maxPct ?? null,
        roundClassicQty(inputKg * line.pct / 100),
      ));
    }
    inputKg = mainQty;
  }
  await db.batch(statements);
}
