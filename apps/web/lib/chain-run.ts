import { roundClassicQty } from './process-chain-classic';

export type ChainRunStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'VOID' | 'PAUSED';
export type RunStepStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'SKIPPED';
export type StepLineKind = 'main' | 'byproduct' | 'loss';

export type ChainRunStepLine = {
  id: string;
  kind: StepLineKind;
  item_id?: string | null;
  item_name?: string | null;
  expected_pct?: number | null;
  expected_min_pct?: number | null;
  expected_max_pct?: number | null;
  forecast_base: number;
  actual_base?: number | null;
  godown_id?: string | null;
  godown_name?: string | null;
  lot_id?: string | null;
  lot_code?: string | null;
};

export type ChainRunStep = {
  id: string;
  step_number: number;
  process_type_id: string;
  process_type_name?: string | null;
  source_chain_step_id?: string | null;
  status: RunStepStatus;
  forecast_input_base: number;
  forecast_main_base: number;
  actual_input_base?: number | null;
  actual_main_base?: number | null;
  process_run_id?: string | null;
  notes?: string | null;
  lines: ChainRunStepLine[];
};

export type ChainRunRecord = {
  id: string;
  code: string;
  chain_id: string;
  chain_name?: string;
  status: ChainRunStatus;
  unit?: string | null;
  planned_input_base: number;
  start_date?: string;
  started_at?: string | null;
  end_date?: string | null;
  total_input_base?: number;
  total_output_base?: number;
  total_loss_base?: number;
  total_byproduct_base?: number;
  notes?: string | null;
};

export type ChainRunListItem = ChainRunRecord & {
  creator_name?: string | null;
  total_steps?: number;
  completed_steps?: number;
};

export type ChainRunDetail = {
  input_allocations?: { lot_id: string; quantity_base: number }[];
  chain_run: ChainRunRecord;
  run_steps: ChainRunStep[];
  chain_mass_balance?: {
    original_input_base: number;
    final_output_base: number;
    total_byproduct_base: number;
    total_loss_base: number;
    unexplained_base: number;
    yield_pct: number;
  };
};

export type AvailableLot = {
  id: string;
  code: string;
  item_id: string;
  item_name: string;
  qty_kg: number;
  godown_id?: string | null;
  godown_name?: string | null;
  sauda_id?: string | null;
  sauda_code?: string | null;
  gate_entry_id?: string | null;
  received_qty_kg?: number | null;
  consumed_qty_kg?: number | null;
  disposition?: string;
  eligible?: boolean;
  for_reuse?: boolean;
};

export type StockGroupAllocation = {
  lot_id: string;
  lot_code: string;
  godown_id: string | null;
  godown_name: string | null;
  available_kg: number;
  received_kg: number;
  consumed_kg: number;
};

export type StockInputGroup = {
  group_key: string;
  item_id: string;
  item_name: string;
  sauda_id: string | null;
  sauda_code: string | null;
  total_available_kg: number;
  allocations: StockGroupAllocation[];
};

export type InputAllocationDraft = {
  lot_id: string;
  quantity_display: string;
};

export type Godown = { id: string; name: string };

const UNIT_BASE_KG: Record<string, number> = { KG: 1, QUINTAL: 100, TONNE: 1000, BAG: 1 };

export function baseToDisplay(baseKg: number, unit: string) {
  const factor = UNIT_BASE_KG[unit.toUpperCase()] ?? 100;
  return roundClassicQty(baseKg / factor);
}

export function displayToBase(display: number, unit: string) {
  const factor = UNIT_BASE_KG[unit.toUpperCase()] ?? 100;
  return roundClassicQty(display * factor);
}

export type VarianceTone = 'neutral' | 'low' | 'high' | 'inside';

export function varianceTone(actual: number, min?: number | null, max?: number | null): VarianceTone {
  if (min == null && max == null) return 'neutral';
  if (max != null && actual > max) return 'high';
  if (min != null && actual < min) return 'low';
  return 'inside';
}

export function varianceDelta(actual: number, expected: number) {
  const delta = roundClassicQty(actual - expected);
  const pct = expected > 0 ? roundClassicQty((delta / expected) * 100) : 0;
  return { delta, pct };
}

export function formatVarianceLabel(actual: number, expected: number, unit: string) {
  const { delta, pct } = varianceDelta(actual, expected);
  const sign = delta >= 0 ? '+' : '';
  return `Expected ${expected} ${unit}, got ${actual} ${unit} (${sign}${pct}%)`;
}

export function parseDisplayQty(value: string | number | undefined | null) {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return roundClassicQty(parsed);
}

export type StepMassBalance = {
  inputDisplay: number;
  mainDisplay: number;
  byproductDisplay: number;
  lossDisplay: number;
  totalOutDisplay: number;
  overInput: boolean;
};

/** Waste is always derived: input minus main output and by-products. */
export function computeStepMassBalance(
  inputBase: number,
  unit: string,
  mainDisplay: number,
  byproductDisplays: number[],
): StepMassBalance {
  const inputDisplay = baseToDisplay(inputBase, unit);
  const byproductDisplay = roundClassicQty(byproductDisplays.reduce((sum, qty) => sum + qty, 0));
  const totalOutDisplay = roundClassicQty(mainDisplay + byproductDisplay);
  const lossDisplay = roundClassicQty(Math.max(0, inputDisplay - totalOutDisplay));
  return {
    inputDisplay,
    mainDisplay: roundClassicQty(mainDisplay),
    byproductDisplay,
    lossDisplay,
    totalOutDisplay,
    overInput: totalOutDisplay > inputDisplay + 0.000001,
  };
}

export function massBalanceForStep(
  step: ChainRunStep,
  unit: string,
  qtyByLineId: Record<string, string>,
  mainOverride?: number,
) {
  const mainLine = step.lines.find((line) => line.kind === 'main');
  const mainFromDraft = mainLine ? parseDisplayQty(qtyByLineId[mainLine.id]) : null;
  const mainDisplay = mainOverride ?? mainFromDraft ?? baseToDisplay(step.actual_main_base ?? step.forecast_main_base, unit);
  const byproductDisplays = step.lines
    .filter((line) => line.kind === 'byproduct')
    .map((line) => parseDisplayQty(qtyByLineId[line.id]) ?? baseToDisplay(line.actual_base ?? line.forecast_base, unit));
  return computeStepMassBalance(step.forecast_input_base, unit, mainDisplay, byproductDisplays);
}

export type ActualsValidation = { ok: true } | { ok: false; message: string };

export function validateStepActuals(params: {
  step: ChainRunStep;
  unit: string;
  actualDraft: Record<string, { qty: string; godownId: string }>;
  inputAllocations?: InputAllocationDraft[];
  selectedInputLotId?: string;
  godowns: Godown[];
  requireInputLot?: boolean;
  availableLots?: AvailableLot[];
}): ActualsValidation {
  const {
    step,
    unit,
    actualDraft,
    inputAllocations = [],
    selectedInputLotId,
    godowns,
    requireInputLot = true,
    availableLots = [],
  } = params;
  const qtyByLineId = Object.fromEntries(Object.entries(actualDraft).map(([id, entry]) => [id, entry.qty]));
  const balance = massBalanceForStep(step, unit, qtyByLineId);

  const inputDisplay = parseDisplayQty(actualDraft.__input__?.qty) ?? baseToDisplay(step.forecast_input_base, unit);
  const inputBase = displayToBase(inputDisplay, unit);

  if (requireInputLot) {
    const hasAllocations = inputAllocations.some((entry) => parseDisplayQty(entry.quantity_display) != null);
    if (!hasAllocations && !selectedInputLotId) {
      return { ok: false, message: 'Select stock lots from Available materials on the left.' };
    }
    const lotsById = new Map(availableLots.map((lot) => [lot.id, lot]));
    let allocatedBase = 0;
    const drafts = inputAllocations.length
      ? inputAllocations
      : selectedInputLotId
        ? [{ lot_id: selectedInputLotId, quantity_display: String(inputDisplay) }]
        : [];
    let itemId = '';
    for (const entry of drafts) {
      const qty = parseDisplayQty(entry.quantity_display);
      if (qty == null || qty <= 0) {
        return { ok: false, message: 'Each selected godown allocation must have a quantity greater than zero.' };
      }
      const lot = lotsById.get(entry.lot_id);
      if (!lot) return { ok: false, message: 'One of the selected stock lots is no longer available.' };
      const qtyBase = displayToBase(qty, unit);
      if (qtyBase > lot.qty_kg) {
        return { ok: false, message: `${lot.code} in ${lot.godown_name ?? 'storage'} only has ${baseToDisplay(lot.qty_kg, unit)} ${unit.toLowerCase()} available.` };
      }
      if (itemId && itemId !== lot.item_id) {
        return { ok: false, message: 'All input allocations must use the same material.' };
      }
      itemId = lot.item_id;
      allocatedBase += qtyBase;
    }
    if (Math.abs(allocatedBase - inputBase) > 0.000001) {
      return {
        ok: false,
        message: `Allocated total (${baseToDisplay(allocatedBase, unit)} ${unit.toLowerCase()}) must equal processing input (${inputDisplay} ${unit.toLowerCase()}).`,
      };
    }
  }

  const mainLine = step.lines.find((line) => line.kind === 'main');
  const mainQty = mainLine ? parseDisplayQty(actualDraft[mainLine.id]?.qty) : null;
  if (mainQty == null) {
    return { ok: false, message: 'Enter a valid main output quantity (0 or more).' };
  }

  for (const line of step.lines.filter((entry) => entry.kind !== 'loss')) {
    const qty = parseDisplayQty(actualDraft[line.id]?.qty);
    if (qty == null) {
      const label = line.kind === 'main' ? 'main output' : (line.item_name ?? 'by-product');
      return { ok: false, message: `Enter a valid quantity for ${label} (0 or more).` };
    }
    if (qty > 0 && !line.item_id) {
      return {
        ok: false,
        message: `"${line.item_name ?? line.kind}" is not linked to an inventory item. Open All processes, edit "${step.process_type_name ?? 'this process'}", and assign an item to each output line.`,
      };
    }
    if (line.kind === 'byproduct' && qty > 0 && !actualDraft[line.id]?.godownId) {
      return { ok: false, message: `Choose a godown for ${line.item_name ?? 'by-product'}.` };
    }
  }

  if (balance.overInput) {
    return {
      ok: false,
      message: `Output and by-products total ${balance.totalOutDisplay} ${unit.toLowerCase()}, but only ${balance.inputDisplay} ${unit.toLowerCase()} went in. Lower the quantities or check the input amount.`,
    };
  }

  if (!godowns.length && step.lines.some((line) => line.kind === 'byproduct' && (parseDisplayQty(actualDraft[line.id]?.qty) ?? 0) > 0)) {
    return { ok: false, message: 'No godowns are set up. Add a godown before posting by-products to inventory.' };
  }

  return { ok: true };
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Request failed');
  return body;
}

export async function createChainRun(chainId: string, plannedInput: number, unit: string) {
  return apiJson<ChainRunDetail>('/api/chain-runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chain_id: chainId, planned_input: plannedInput, unit }),
  });
}

export async function loadChainRun(runId: string) {
  return apiJson<ChainRunDetail>(`/api/chain-runs/${encodeURIComponent(runId)}`);
}

export async function patchChainRun(runId: string, patch: { planned_input?: number; unit?: string; notes?: string; input_allocations?: { lot_id: string; quantity_base: number }[] }) {
  return apiJson<ChainRunDetail>(`/api/chain-runs/${encodeURIComponent(runId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function patchChainRunSteps(runId: string, steps: { process_type_id: string; source_chain_step_id?: string | null; notes?: string }[]) {
  return apiJson<ChainRunDetail>(`/api/chain-runs/${encodeURIComponent(runId)}/steps`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ steps }),
  });
}

export async function startChainRun(runId: string) {
  return apiJson<ChainRunDetail>(`/api/chain-runs/${encodeURIComponent(runId)}/start`, { method: 'POST' });
}

export async function postStepActuals(
  runId: string,
  stepId: string,
  payload: {
    input_lot_id?: string;
    input_allocations?: { lot_id: string; quantity: number; unit?: string; quantity_base?: number }[];
    input_quantity?: number;
    destination_godown_id?: string;
    idempotency_key?: string;
    lines: { line_id?: string; kind?: string; item_name?: string; actual_base?: number; quantity?: number; unit?: string; godown_id?: string }[];
  },
) {
  return apiJson<ChainRunDetail & { chain_status?: string }>(`/api/chain-runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}/actuals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function skipRunStep(runId: string, stepId: string) {
  return apiJson<ChainRunDetail>(`/api/chain-runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}/skip`, { method: 'POST' });
}

export async function loadAvailableInputs(runId: string, stepId: string, filters?: { item_id?: string; godown_id?: string }) {
  const params = new URLSearchParams({ step_id: stepId });
  if (filters?.item_id) params.set('item_id', filters.item_id);
  if (filters?.godown_id) params.set('godown_id', filters.godown_id);
  return apiJson<{
    groups: StockInputGroup[];
    reuse_groups: StockInputGroup[];
    eligible: AvailableLot[];
    for_reuse: AvailableLot[];
    ineligible: { lot: AvailableLot; reason: string }[];
  }>(`/api/chain-runs/${encodeURIComponent(runId)}/available-inputs?${params}`);
}

export async function loadChainRunHistory(chainId: string, from?: string, to?: string) {
  const params = new URLSearchParams({ chain_id: chainId });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return apiJson<{ chain_runs: ChainRunListItem[] }>(`/api/chain-runs?${params}`);
}

export async function voidChainRun(runId: string, reason?: string) {
  return apiJson<{ ok: boolean }>(`/api/chain-runs/${encodeURIComponent(runId)}/void`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}

export function chainRunStatusLabel(status: ChainRunStatus) {
  if (status === 'COMPLETED') return 'Completed';
  if (status === 'VOID') return 'Void';
  if (status === 'IN_PROGRESS') return 'In progress';
  if (status === 'DRAFT') return 'Draft';
  if (status === 'PAUSED') return 'Paused';
  return status;
}

export function formatChainRunLinesSummary(run: ChainRunListItem) {
  const unit = (run.unit ?? 'QUINTAL').toLowerCase();
  const inputBase = run.status === 'DRAFT' || !run.total_input_base ? run.planned_input_base ?? 0 : run.total_input_base;
  const input = baseToDisplay(inputBase, run.unit ?? 'QUINTAL');
  const output = baseToDisplay(run.total_output_base ?? 0, run.unit ?? 'QUINTAL');
  const byproduct = baseToDisplay(run.total_byproduct_base ?? 0, run.unit ?? 'QUINTAL');
  const loss = baseToDisplay(run.total_loss_base ?? 0, run.unit ?? 'QUINTAL');
  const parts = [`input: ${input} ${unit}`];
  if (output > 0) parts.push(`output: ${output} ${unit}`);
  if (byproduct > 0) parts.push(`by-products: ${byproduct} ${unit}`);
  if (loss > 0) parts.push(`waste: ${loss} ${unit}`);
  return parts.join(' · ');
}

export async function splitLot(lotId: string, quantity: number, unit: string, disposition: 'FOR_SALE' | 'FOR_REUSE' | 'STOCK', godownId?: string) {
  return apiJson<{ id: string; code: string; disposition: string }>(`/api/lots/${encodeURIComponent(lotId)}/split`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quantity, unit, disposition, godown_id: godownId }),
  });
}

export async function setLotDisposition(lotId: string, disposition: 'FOR_SALE' | 'FOR_REUSE' | 'STOCK') {
  return apiJson<{ ok: boolean }>(`/api/lots/${encodeURIComponent(lotId)}/disposition`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ disposition }),
  });
}
