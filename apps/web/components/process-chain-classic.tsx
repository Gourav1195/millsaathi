'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogProcessType } from './process-catalog';
import { Badge, Button, DataTable, EmptyState, Field, Input, Select, TableCard } from './ui';
import { TableEditCell, TableEditModeButton } from './table-edit-mode';
import { can } from '../lib/permissions';
import { useSession } from '../lib/session';
import { useTableEditMode, withEditModeColumns } from '../lib/table-edit-mode';
import {
  chainInputLabel,
  classifyItemsForProcess,
  classifyLotsForProcess,
  classicUnits,
  computeClassicForecast,
  itemMatchesProcessInput,
  roundClassicQty,
  type CatalogItem,
} from '../lib/process-chain-classic';
import type { ProcessingChainRecord } from '../lib/process-studio';
import {
  baseToDisplay,
  createChainRun,
  displayToBase,
  formatVarianceLabel,
  loadAvailableInputs,
  loadChainRun,
  loadChainRunHistory,
  massBalanceForStep,
  patchChainRun,
  patchChainRunSteps,
  postStepActuals,
  skipRunStep,
  splitLot,
  startChainRun,
  validateStepActuals,
  voidChainRun,
  chainRunStatusLabel,
  formatChainRunLinesSummary,
  type AvailableLot,
  type ChainRunDetail,
  type ChainRunListItem,
  type ChainRunStep,
  type ChainRunStepLine,
  type StepMassBalance,
  varianceTone,
} from '../lib/chain-run';

const DRAG_TYPE = 'application/millsaathi-classic-process';
const CHAIN_RUN_COLUMNS_BASE = [
  { id: 'date', label: 'Date' },
  { id: 'run', label: 'Run' },
  { id: 'lines', label: 'Lines' },
  { id: 'postedBy', label: 'Posted by' },
  { id: 'status', label: 'Status' },
];
const ITEM_DRAG_TYPE = 'application/millsaathi-classic-item';

type StepInputAssignment = {
  itemId: string;
  itemName: string;
  lotId?: string;
  lotCode?: string;
};

function ClassicLibraryItem({ type }: { type: CatalogProcessType }) {
  function onDragStart(event: React.DragEvent<HTMLButtonElement>) {
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ id: type.id, name: type.name }));
    event.dataTransfer.effectAllowed = 'copy';
  }
  return (
    <button type="button" className="chain-library-item" draggable onDragStart={onDragStart}>
      + {type.name}
    </button>
  );
}

function ChainLibraryPanel({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="chain-library-panel">
      <strong>{title}</strong>
      <span className="hint">{hint}</span>
      <div className="chain-library-scroll">{children}</div>
    </section>
  );
}

function ItemCard({
  item,
  selected,
  onSelect,
}: {
  item: CatalogItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const unitLabel = (item.display_unit ?? item.unit ?? 'QUINTAL').toLowerCase();

  function onDragStart(event: React.DragEvent<HTMLButtonElement>) {
    if (selected) return;
    event.dataTransfer.setData(ITEM_DRAG_TYPE, item.id);
    event.dataTransfer.effectAllowed = 'copy';
  }

  return (
    <button
      type="button"
      className={`process-material${selected ? ' used' : ''}`}
      draggable={!selected}
      onDragStart={onDragStart}
      onClick={onSelect}
      disabled={selected}
    >
      <span className="process-material-head">
        <span><strong>{item.name}</strong><small>{item.category_code ?? item.category ?? 'Item'}</small></span>
        <b>{selected ? 'Added' : 'Use'}</b>
      </span>
      <small>Catalog item · {unitLabel}</small>
    </button>
  );
}

function MaterialCard({
  lot,
  selected,
  readOnly,
  onSelect,
}: {
  lot: AvailableLot;
  selected: boolean;
  readOnly?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`process-material${selected ? ' used' : ''}`}
      onClick={readOnly ? undefined : onSelect}
      disabled={selected || readOnly}
    >
      <span className="process-material-head">
        <span><strong>{lot.item_name}</strong><small>{lot.code}</small></span>
        <b>{selected ? 'Added' : readOnly ? '' : 'Use'}</b>
      </span>
      <span className="process-material-qty">{(lot.qty_kg / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} quintal available</span>
      <small>{lot.godown_name ?? 'No godown'}{lot.for_reuse ? ' · For reuse' : ''}</small>
    </button>
  );
}

function RangeHint({ line, unit, inputBase }: { line: ChainRunStepLine; unit: string; inputBase: number }) {
  if (line.expected_min_pct == null && line.expected_max_pct == null) return null;
  const minDisplay = line.expected_min_pct != null ? baseToDisplay(roundClassicQty(inputBase * line.expected_min_pct / 100), unit) : null;
  const maxDisplay = line.expected_max_pct != null ? baseToDisplay(roundClassicQty(inputBase * line.expected_max_pct / 100), unit) : null;
  if (minDisplay == null && maxDisplay == null) return null;
  return (
    <small className="chain-map-range-hint">
      Expected {minDisplay ?? '—'} – {maxDisplay ?? '—'} {unit}
    </small>
  );
}

function lineKindLabel(kind: ChainRunStepLine['kind']) {
  if (kind === 'byproduct') return 'By-product';
  if (kind === 'loss') return 'Loss';
  return 'Output';
}

function StepNode({
  step,
  unit,
  selected,
  editable,
  linesEditable,
  planningMode,
  inputSatisfied,
  assignedInput,
  mainOverride,
  lineQtys,
  massBalance,
  onSelect,
  onMainChange,
  onLineQtyChange,
  onAssignItem,
  onClearInput,
}: {
  step: ChainRunStep;
  unit: string;
  selected: boolean;
  editable: boolean;
  linesEditable: boolean;
  planningMode: boolean;
  inputSatisfied: boolean;
  assignedInput?: StepInputAssignment | null;
  mainOverride?: number;
  lineQtys: Record<string, string>;
  massBalance?: StepMassBalance;
  onSelect: () => void;
  onMainChange?: (value: number) => void;
  onLineQtyChange?: (lineId: string, value: string) => void;
  onAssignItem?: (itemId: string) => void;
  onClearInput?: () => void;
}) {
  const mainLine = step.lines.find((l) => l.kind === 'main');
  const mainForecast = baseToDisplay(step.forecast_main_base, unit);
  const mainActual = step.actual_main_base != null ? baseToDisplay(step.actual_main_base, unit) : null;
  const blankPlanning = planningMode && inputSatisfied;
  const displayMain = blankPlanning
    ? (lineQtys[mainLine?.id ?? ''] ?? '')
    : (mainOverride ?? mainActual ?? mainForecast);
  const inputDisplay = baseToDisplay(step.forecast_input_base, unit);
  const tone = mainLine && !blankPlanning ? varianceTone(Number(displayMain), mainLine.expected_min_pct, mainLine.expected_max_pct) : 'neutral';
  const statusLabel = planningMode && !inputSatisfied
    ? 'Needs input'
    : step.status === 'ACTIVE'
      ? 'Running'
      : step.status === 'COMPLETED'
        ? 'Done'
        : step.status === 'SKIPPED'
          ? 'Skipped'
          : planningMode && inputSatisfied
            ? 'Ready'
            : 'Forecast';
  const sideLines = step.lines.filter((l) => l.kind !== 'main');
  const showSideOutputs = !planningMode || inputSatisfied;

  function onItemDrop(event: React.DragEvent) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    const itemId = event.dataTransfer.getData(ITEM_DRAG_TYPE);
    if (itemId) onAssignItem?.(itemId);
  }

  return (
    <div className="chain-map-column">
      <div className="chain-map-column-stack">
        <div
          role="button"
          tabIndex={0}
          className={`chain-map-node${selected ? ' selected' : ''}${step.status === 'ACTIVE' ? ' review' : ''}${planningMode && !inputSatisfied ? ' chain-map-node--needs-input' : ''}${tone === 'high' ? ' chain-variance-high' : ''}${tone === 'low' ? ' chain-variance-low' : ''}`}
          onClick={onSelect}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(); } }}
          onDragOver={(event) => {
            if (!planningMode || inputSatisfied) return;
            event.preventDefault();
            event.currentTarget.classList.add('drag-over');
          }}
          onDragLeave={(event) => event.currentTarget.classList.remove('drag-over')}
          onDrop={(event) => {
            if (!planningMode || inputSatisfied) return;
            onItemDrop(event);
          }}
        >
          <span className="chain-status-dot" aria-hidden="true" />
          <span className="chain-map-step">{step.step_number}</span>
          <strong>{step.process_type_name ?? 'Process'}</strong>
          <span className="chain-map-state">{statusLabel}</span>
          {planningMode && !inputSatisfied ? (
            <div
              className="chain-map-input-slot"
              onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
              onDrop={(event) => { event.stopPropagation(); onItemDrop(event); }}
            >
              <span className="hint">Drop an eligible item here</span>
            </div>
          ) : (
            <span className={`chain-map-metric${massBalance?.overInput ? ' chain-input-over' : ''}`}>
              Input <b>{assignedInput ? assignedInput.itemName : `${inputDisplay} ${unit}`}</b>
              {assignedInput?.lotCode ? <small className="chain-map-assigned-lot">{assignedInput.lotCode}</small> : null}
              {massBalance?.overInput ? <small className="chain-input-over-hint">Exceeds input</small> : null}
            </span>
          )}
          {planningMode && assignedInput && (
            <button type="button" className="chain-map-clear-input" onClick={(event) => { event.stopPropagation(); onClearInput?.(); }}>
              Clear input
            </button>
          )}
          {showSideOutputs && (
            <span className="chain-map-metric editable">
              {step.status === 'COMPLETED' ? 'Actual output' : 'Output'}
              <span className="chain-map-output-field">
                {editable && (!planningMode || inputSatisfied) ? (
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={displayMain}
                    placeholder={blankPlanning ? '—' : undefined}
                    onChange={(event) => {
                      if (blankPlanning && mainLine) onLineQtyChange?.(mainLine.id, event.target.value);
                      else onMainChange?.(roundClassicQty(Number(event.target.value)));
                    }}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Output for ${step.process_type_name ?? 'process'}`}
                  />
                ) : (
                  <b>{displayMain}</b>
                )}
                <b>{unit}</b>
              </span>
            </span>
          )}
          {mainLine && editable && showSideOutputs && (planningMode ? inputSatisfied : true) && (
            <RangeHint line={mainLine} unit={unit} inputBase={step.forecast_input_base} />
          )}
          {mainActual != null && mainLine && !planningMode && (
            <small className="chain-map-variance">{formatVarianceLabel(mainActual, mainForecast, unit)}</small>
          )}
        </div>
        {showSideOutputs ? (
        <div className="chain-map-side-outputs">
          {sideLines.map((line) => {
            const forecast = baseToDisplay(line.forecast_base, unit);
            const actual = line.actual_base != null ? baseToDisplay(line.actual_base, unit) : null;
            const isComputedLoss = line.kind === 'loss';
            const computedLossQty = isComputedLoss && massBalance ? massBalance.lossDisplay : null;
            const displayQty = isComputedLoss && computedLossQty != null
              ? String(computedLossQty)
              : blankPlanning
                ? (lineQtys[line.id] ?? '')
                : (lineQtys[line.id] ?? (actual != null ? String(actual) : String(forecast)));
            const tone = isComputedLoss
              ? 'neutral'
              : varianceTone(Number(displayQty), line.expected_min_pct, line.expected_max_pct);
            const lossEditable = linesEditable && !isComputedLoss;
            return (
              <div className={`chain-map-byproduct-branch${line.kind === 'loss' ? ' chain-map-byproduct-branch--loss' : ''}`} key={line.id}>
                <span className="chain-map-byproduct-arrow" aria-hidden="true" />
                <div className={`chain-map-byproduct-pill${tone === 'high' ? ' chain-variance-high' : ''}${tone === 'low' ? ' chain-variance-low' : ''}`}>
                  <b>{line.item_name ?? line.kind}</b>
                  <span className="chain-map-byproduct-kind">{isComputedLoss ? 'Waste (calculated)' : lineKindLabel(line.kind)}</span>
                  {lossEditable ? (
                    <span className="chain-map-byproduct-qty">
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={displayQty}
                        placeholder={blankPlanning ? '—' : undefined}
                        onChange={(event) => onLineQtyChange?.(line.id, event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`${lineKindLabel(line.kind)} quantity for ${line.item_name ?? line.kind}`}
                      />
                      <b>{unit}</b>
                    </span>
                  ) : (
                    <small>
                      {isComputedLoss && computedLossQty != null ? computedLossQty : (actual ?? forecast)} {unit}
                      {line.lot_code ? ` → ${line.lot_code}` : ''}
                      {line.godown_name ? `, ${line.godown_name}` : ''}
                      {isComputedLoss ? ' · from balance' : ''}
                    </small>
                  )}
                  {(lossEditable || blankPlanning) && (line.expected_min_pct != null || line.expected_max_pct != null) && (
                    <RangeHint line={line} unit={unit} inputBase={step.forecast_input_base} />
                  )}
                  {!lossEditable && !isComputedLoss && actual != null && (
                    <small className="chain-map-variance">{formatVarianceLabel(actual, forecast, unit)}</small>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        ) : null}
      </div>
    </div>
  );
}

function ClassicChainMap({
  chain,
  types,
  preferredUnit,
  canStartRun,
  onError,
}: {
  chain: ProcessingChainRecord;
  types: CatalogProcessType[];
  preferredUnit?: string | null;
  canStartRun: boolean;
  onError: (message: string | null) => void;
}) {
  const { session } = useSession();
  const tableEdit = useTableEditMode();
  const canVoidRun = can(session, 'processing:void');
  const cardRef = useRef<HTMLDivElement>(null);
  const unitOptions = useMemo(() => classicUnits(preferredUnit), [preferredUnit]);
  const [unit, setUnit] = useState(unitOptions[0] ?? 'Quintal');
  const [plannedInput, setPlannedInput] = useState(100);
  const [runDetail, setRunDetail] = useState<ChainRunDetail | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ChainRunListItem[]>([]);
  const [recentRuns, setRecentRuns] = useState<ChainRunListItem[]>([]);
  const [materials, setMaterials] = useState<{ eligible: AvailableLot[]; for_reuse: AvailableLot[]; ineligible: { lot: AvailableLot; reason: string }[] } | null>(null);
  const [selectedInputLotId, setSelectedInputLotId] = useState('');
  const [actualDraft, setActualDraft] = useState<Record<string, { qty: string; godownId: string }>>({});
  const [godowns, setGodowns] = useState<{ id: string; name: string }[]>([]);
  const [mainOverrides, setMainOverrides] = useState<Record<string, number>>({});
  const [lineOverrides, setLineOverrides] = useState<Record<string, string>>({});
  const [stepAssignments, setStepAssignments] = useState<Record<string, StepInputAssignment>>({});
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [workspaceLots, setWorkspaceLots] = useState<AvailableLot[]>([]);

  const run = runDetail?.chain_run ?? null;
  const runSteps = runDetail?.run_steps ?? [];

  const templatePreview = useMemo((): ChainRunStep[] => {
    if (run) return [];
    const sorted = chain.steps.slice().sort((left, right) => left.step_number - right.step_number);
    if (!sorted.length) return [];
    return computeClassicForecast(sorted, types, plannedInput, mainOverrides).map((entry) => ({
      id: entry.id,
      step_number: entry.index + 1,
      process_type_id: entry.step.process_type_id,
      process_type_name: entry.step.process_type_name,
      status: 'PENDING',
      forecast_input_base: displayToBase(entry.inputQty, unit),
      forecast_main_base: displayToBase(entry.mainQty, unit),
      lines: entry.profile.lines.map((line, lineIndex) => {
        const displayQty = line.kind === 'main'
          ? entry.mainQty
          : line.kind === 'loss'
            ? entry.lossQty
            : entry.byproductQtys.find((candidate) => candidate.name === line.name)?.qty ?? 0;
        const profileLine = entry.profile.lines.find((candidate) => candidate.kind === line.kind && candidate.name === line.name);
        return {
          id: `${entry.id}-${line.kind}-${lineIndex}`,
          kind: line.kind,
          item_name: line.name,
          item_id: profileLine?.itemId ?? null,
          expected_pct: line.pct,
          expected_min_pct: profileLine?.minPct ?? null,
          expected_max_pct: profileLine?.maxPct ?? null,
          forecast_base: displayToBase(displayQty, unit),
        };
      }),
    }));
  }, [run, chain.steps, types, plannedInput, mainOverrides, unit]);

  const steps = run ? runSteps : templatePreview;
  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? steps[0] ?? null;
  const libraryTypes = types.filter((type) => !type.deleted_at && !type.name.toLowerCase().includes('smoke process'));
  const isDraft = run?.status === 'DRAFT';
  const isRunning = run?.status === 'IN_PROGRESS';
  const isReadOnly = run?.status === 'COMPLETED' || run?.status === 'VOID';

  const refreshRun = useCallback(async (runId: string) => {
    const detail = await loadChainRun(runId);
    setRunDetail(detail);
    setSelectedStepId((current) => current || detail.run_steps[0]?.id || '');
    return detail;
  }, []);

  const ensureDraft = useCallback(async () => {
    if (run?.status === 'DRAFT') return run.id;
    setBusy(true);
    onError(null);
    try {
      const detail = await createChainRun(chain.id, plannedInput, unit);
      setRunDetail(detail);
      setSelectedStepId(detail.run_steps[0]?.id ?? '');
      return detail.chain_run.id;
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not create draft run');
      return null;
    } finally {
      setBusy(false);
    }
  }, [chain.id, onError, plannedInput, run?.status, run?.id, unit]);

  const loadRecentRuns = useCallback(async () => {
    try {
      const body = await loadChainRunHistory(chain.id);
      const visible = body.chain_runs.filter((entry) => entry.status !== 'DRAFT');
      setRecentRuns(visible.slice(0, 8));
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load recent chain runs');
    }
  }, [chain.id, onError]);

  function returnToChainTemplate() {
    setRunDetail(null);
    setHistoryOpen(false);
    setEditMode(false);
    setSelectedStepId('');
    setSelectedInputLotId('');
    setActualDraft({});
    setMaterials(null);
    setWorkspaceLots([]);
    onError(null);
  }

  useEffect(() => {
    setRunDetail(null);
    setEditMode(false);
    setSelectedStepId('');
    setMainOverrides({});
    setLineOverrides({});
    setStepAssignments({});
    setWorkspaceLots([]);
    void loadRecentRuns();
  }, [chain.id, loadRecentRuns]);

  const selectedProcessType = useMemo(
    () => types.find((type) => type.id === selectedStep?.process_type_id),
    [types, selectedStep?.process_type_id],
  );

  const assignedItemIds = useMemo(
    () => new Set(Object.values(stepAssignments).map((assignment) => assignment.itemId)),
    [stepAssignments],
  );

  const classifiedItems = useMemo(
    () => classifyItemsForProcess(selectedProcessType, catalogItems),
    [selectedProcessType, catalogItems],
  );

  const planningMode = editMode && !isRunning && !isReadOnly;

  function lineQtyForStep(step: ChainRunStep, line: ChainRunStepLine) {
    if (planningMode && stepAssignments[step.id]) {
      if (lineOverrides[line.id]) return lineOverrides[line.id];
      return '';
    }
    if (step.status === 'ACTIVE' && selectedStep?.id === step.id && actualDraft[line.id]?.qty) {
      return actualDraft[line.id].qty;
    }
    if (lineOverrides[line.id]) return lineOverrides[line.id];
    if (line.actual_base != null) return String(baseToDisplay(line.actual_base, unit));
    return String(baseToDisplay(line.forecast_base, unit));
  }

  function updateLineQty(step: ChainRunStep, lineId: string, value: string) {
    if (step.status === 'ACTIVE' && selectedStep?.id === step.id) {
      setActualDraft((current) => ({
        ...current,
        [lineId]: { ...current[lineId], qty: value, godownId: current[lineId]?.godownId ?? '' },
      }));
      return;
    }
    setLineOverrides((current) => ({ ...current, [lineId]: value }));
  }

  useEffect(() => {
    if (!selectedStepId && steps[0]?.id) setSelectedStepId(steps[0].id);
  }, [selectedStepId, steps]);

  useEffect(() => {
    void fetch('/api/overview', { credentials: 'include' })
      .then((r) => r.json())
      .then((body: { godowns?: { id: string; name: string }[]; items?: CatalogItem[] }) => {
        setGodowns(body.godowns ?? []);
        setCatalogItems(body.items ?? []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedStep?.id) {
      setMaterials(null);
      setWorkspaceLots([]);
      return;
    }

    if (isReadOnly) {
      setMaterials(null);
      setWorkspaceLots([]);
      return;
    }

    if (run?.id) {
      void loadAvailableInputs(run.id, selectedStep.id)
        .then(setMaterials)
        .catch((cause: unknown) => onError(cause instanceof Error ? cause.message : 'Could not load materials'));
      setWorkspaceLots([]);
      return;
    }

    if (!selectedStep.process_type_id) {
      setMaterials(null);
      return;
    }

    void fetch(`/api/process-workspace?process_type_id=${encodeURIComponent(selectedStep.process_type_id)}`, { credentials: 'include' })
      .then((response) => response.json())
      .then((body: { lots?: AvailableLot[]; error?: string }) => {
        if (body.error) throw new Error(body.error);
        const lots = (body.lots ?? []).map((lot) => ({
          ...lot,
          disposition: lot.disposition ?? 'STOCK',
        }));
        setWorkspaceLots(lots);
        setMaterials(classifyLotsForProcess(selectedProcessType, lots));
      })
      .catch((cause: unknown) => onError(cause instanceof Error ? cause.message : 'Could not load materials'));
  }, [run?.id, selectedStep?.id, selectedStep?.process_type_id, isReadOnly, editMode, selectedProcessType, onError]);

  useEffect(() => {
    if (!selectedStep) return;
    const draft: Record<string, { qty: string; godownId: string }> = {};
    for (const line of selectedStep.lines) {
      draft[line.id] = {
        qty: String(baseToDisplay(line.actual_base ?? line.forecast_base, unit)),
        godownId: line.godown_id ?? '',
      };
    }
    setActualDraft(draft);
  }, [selectedStep, unit]);

  function assignItemToStep(stepId: string, itemId: string) {
    const step = steps.find((candidate) => candidate.id === stepId);
    if (!step) return;
    const processType = types.find((type) => type.id === step.process_type_id);
    const item = catalogItems.find((candidate) => candidate.id === itemId);
    if (!item) {
      onError('Item not found. Pick an item from the Items list.');
      return;
    }
    if (assignedItemIds.has(item.id) && stepAssignments[stepId]?.itemId !== item.id) {
      onError('This item is already assigned to another step.');
      return;
    }
    if (!itemMatchesProcessInput(processType, item.id)) {
      onError(`${item.name} is not accepted by ${step.process_type_name ?? 'this process'}.`);
      return;
    }
    onError(null);
    setStepAssignments((current) => ({
      ...current,
      [stepId]: {
        itemId: item.id,
        itemName: item.name,
      },
    }));
  }

  function clearStepInput(stepId: string) {
    setStepAssignments((current) => {
      const next = { ...current };
      delete next[stepId];
      return next;
    });
    setLineOverrides({});
    if (selectedStepId === stepId) setSelectedInputLotId('');
  }

  async function handleCreateOrEdit() {
    if (editMode) return;
    if (!run && canStartRun) {
      const runId = await ensureDraft();
      if (!runId) return;
    }
    setEditMode(true);
    setStepAssignments({});
    setLineOverrides({});
    setMainOverrides({});
  }

  function exitEditMode() {
    setEditMode(false);
    setStepAssignments({});
    setLineOverrides({});
  }

  async function handlePlannedInputChange(value: string) {
    const qty = roundClassicQty(Number(value));
    setPlannedInput(qty);
    if (!run?.id || run.status !== 'DRAFT') return;
    try {
      const detail = await patchChainRun(run.id, { planned_input: qty, unit });
      setRunDetail(detail);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not update forecast');
    }
  }

  async function handleStartRun() {
    if (!run?.id || !canStartRun) return;
    setBusy(true);
    onError(null);
    try {
      const detail = await startChainRun(run.id);
      setRunDetail(detail);
      setEditMode(false);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not start run');
    } finally {
      setBusy(false);
    }
  }

  async function handleDropProcess(event: React.DragEvent) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    if (!editMode || isRunning) return;
    const raw = event.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return;
    const runId = run?.id ?? await ensureDraft();
    if (!runId) return;
    try {
      const data = JSON.parse(raw) as { id: string; name: string };
      const currentSteps = (runDetail?.run_steps ?? []).map((s) => ({
        process_type_id: s.process_type_id,
        source_chain_step_id: s.source_chain_step_id ?? undefined,
        notes: s.notes ?? undefined,
      }));
      const detail = await patchChainRunSteps(runId, [
        ...currentSteps,
        { process_type_id: data.id, source_chain_step_id: null },
      ]);
      setRunDetail(detail);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not add process');
    }
  }

  async function handlePostActuals() {
    if (!run?.id || !selectedStep || selectedStep.status !== 'ACTIVE') return;
    const validation = validateStepActuals({
      step: selectedStep,
      unit,
      actualDraft,
      selectedInputLotId,
      godowns,
    });
    if (!validation.ok) {
      onError(validation.message);
      return;
    }
    setBusy(true);
    onError(null);
    try {
      const lines = selectedStep.lines
        .filter((line) => line.kind !== 'loss')
        .map((line) => ({
          line_id: line.id,
          kind: line.kind,
          item_name: line.item_name ?? undefined,
          quantity: Number(actualDraft[line.id]?.qty ?? 0),
          unit,
          godown_id: actualDraft[line.id]?.godownId || undefined,
        }));
      const detail = await postStepActuals(run.id, selectedStep.id, {
        input_lot_id: selectedInputLotId || undefined,
        input_quantity: selectedStep.step_number === 1 ? plannedInput : baseToDisplay(selectedStep.forecast_input_base, unit),
        lines,
        destination_godown_id: godowns[0]?.id,
      });
      setRunDetail(detail);
      setSelectedInputLotId('');
      if (detail.chain_run.status === 'COMPLETED') await loadRecentRuns();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not post actuals');
    } finally {
      setBusy(false);
    }
  }

  async function handleSkipStep() {
    if (!run?.id || !selectedStep) return;
    setBusy(true);
    try {
      const detail = await skipRunStep(run.id, selectedStep.id);
      setRunDetail(detail);
      if (detail.chain_run.status === 'COMPLETED') await loadRecentRuns();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not skip step');
    } finally {
      setBusy(false);
    }
  }

  async function handleVoidRun(entry: ChainRunListItem) {
    const label = entry.code || entry.chain_name || 'this chain run';
    if (!window.confirm(`Void ${label}? Its stock movements will be reversed.`)) return;
    setBusy(true);
    onError(null);
    try {
      await voidChainRun(entry.id);
      if (run?.id === entry.id) await refreshRun(entry.id);
      await loadRecentRuns();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not void chain run');
    } finally {
      setBusy(false);
    }
  }

  async function openHistory() {
    setHistoryOpen(true);
    try {
      const from = new Date();
      from.setDate(from.getDate() - 30);
      const body = await loadChainRunHistory(chain.id, from.toISOString().slice(0, 10));
      setHistory(body.chain_runs);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load history');
    }
  }

  async function loadHistoricalRun(runId: string) {
    try {
      const detail = await refreshRun(runId);
      setRunDetail(detail);
      setHistoryOpen(false);
      setEditMode(false);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load run');
    }
  }

  async function handleDisposition(lotId: string, disposition: 'FOR_SALE' | 'FOR_REUSE') {
    const qty = window.prompt('Quantity to mark (in display unit):');
    if (!qty || !Number(qty)) return;
    try {
      await splitLot(lotId, Number(qty), unit, disposition);
      if (run?.id && selectedStep?.id) {
        const mats = await loadAvailableInputs(run.id, selectedStep.id);
        setMaterials(mats);
      }
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not update lot');
    }
  }

  function toggleFullscreen() {
    const element = cardRef.current;
    if (!element) return;
    if (document.fullscreenElement === element) void document.exitFullscreen();
    else void element.requestFullscreen();
  }

  const activeMassBalance = useMemo(() => {
    if (!selectedStep) return null;
    const qtyByLineId = Object.fromEntries(Object.entries(actualDraft).map(([id, entry]) => [id, entry.qty]));
    return massBalanceForStep(selectedStep, unit, qtyByLineId, mainOverrides[selectedStep.id]);
  }, [selectedStep, unit, actualDraft, mainOverrides]);

  const varianceSummary = useMemo(() => {
    if (!runDetail?.run_steps.length) return null;
    const completed = runDetail.run_steps.filter((s) => s.status === 'COMPLETED');
    const variances = completed.flatMap((step) => step.lines.map((line) => {
      if (line.actual_base == null) return null;
      const expected = line.forecast_base;
      const delta = roundClassicQty(line.actual_base - expected);
      return { name: line.item_name ?? line.kind, delta, expected, actual: line.actual_base };
    }).filter(Boolean));
    return variances as { name: string; delta: number; expected: number; actual: number }[];
  }, [runDetail]);

  return (
    <div ref={cardRef} className={`chain-map-card${fullscreen ? ' chain-map-card--fullscreen' : ''}`}>
      <div className="chain-map-head">
        <div>
          <h3 className="chain-map-title">{chain.name}{run?.code ? ` · ${run.code}` : ''}</h3>
          <p className="muted">
            {planningMode && 'Edit mode — assign items to each step, drag processes from the library, then enter expected outputs.'}
            {!editMode && isDraft && !isRunning && 'Draft — review the chain forecast, then use Edit chain to assign materials.'}
            {isRunning && 'Running — enter actuals for the active step.'}
            {isReadOnly && 'Completed run — read-only audit trail.'}
            {!editMode && !run && !isRunning && 'Chain template preview. Use Edit chain to assign materials and adjust processes.'}
          </p>
        </div>
        <div className="chain-map-controls">
          <label>
            First input
            <Input
              type="number"
              min="0"
              step="0.001"
              value={plannedInput}
              disabled={isRunning || isReadOnly}
              onChange={(event) => void handlePlannedInputChange(event.target.value)}
              aria-label="First input quantity"
            />
          </label>
          <label>
            Unit
            <Select value={unit} disabled={isRunning || isReadOnly} onChange={(event) => setUnit(event.target.value)} aria-label="Forecast unit">
              {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </label>
          {(!run || isDraft) && !isRunning && !isReadOnly && (
            editMode ? (
              <Button type="button" className="secondary" onClick={exitEditMode}>Done editing</Button>
            ) : (
              <Button type="button" className="secondary" onClick={() => void handleCreateOrEdit()}>
                Edit chain
              </Button>
            )
          )}
          <Button type="button" className="secondary" onClick={toggleFullscreen}>
            {fullscreen ? 'Exit full screen' : 'Full screen'}
          </Button>
          <Button type="button" className="secondary" onClick={() => void openHistory()}>History</Button>
          {run && (
            <Button type="button" className="secondary" onClick={returnToChainTemplate}>
              {isReadOnly ? 'Back to chain' : 'Close run'}
            </Button>
          )}
          {canStartRun && isDraft && (
            <Button type="button" disabled={busy || !steps.length} onClick={() => void handleStartRun()}>
              {busy ? 'Starting…' : 'Start run'}
            </Button>
          )}
          {canStartRun && !run && (
            <Button type="button" disabled={busy} onClick={() => void ensureDraft()}>
              {busy ? 'Creating…' : 'New draft run'}
            </Button>
          )}
          {canStartRun && run && (isReadOnly || isRunning) && (
            <Button type="button" disabled={busy} onClick={() => void ensureDraft()}>
              {busy ? 'Creating…' : 'New draft run'}
            </Button>
          )}
        </div>
      </div>

      <div className="chain-map-layout">
        <aside className={`chain-library${editMode ? ' chain-library--edit' : ''}`}>
          {editMode ? (
            <>
              <ChainLibraryPanel title="Process library" hint="Drag a process to add it to this run.">
                {libraryTypes.map((type) => <ClassicLibraryItem key={type.id} type={type} />)}
              </ChainLibraryPanel>
              <div className="chain-library-divider" />
              <ChainLibraryPanel
                title="Items"
                hint={`Drag or click an item for ${selectedStep?.process_type_name ?? 'the selected step'}. Only accepted items can be assigned.`}
              >
                <div className="chain-materials-section">
                  {classifiedItems.eligible.length ? classifiedItems.eligible.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      selected={assignedItemIds.has(item.id)}
                      onSelect={() => selectedStep && assignItemToStep(selectedStep.id, item.id)}
                    />
                  )) : <p className="muted">No eligible items for this step.</p>}
                </div>
                {classifiedItems.ineligible.length ? (
                  <details className="chain-materials-ineligible">
                    <summary>Not eligible here ({classifiedItems.ineligible.length})</summary>
                    {classifiedItems.ineligible.map(({ item, reason }) => (
                      <p key={item.id} className="muted"><strong>{item.name}</strong> · {reason}</p>
                    ))}
                  </details>
                ) : null}
              </ChainLibraryPanel>
            </>
          ) : (
            <ChainLibraryPanel
              title="Available materials"
              hint={
                isRunning
                  ? `Lots eligible for ${selectedStep?.process_type_name ?? 'selected step'}.`
                  : `Lots for ${selectedStep?.process_type_name ?? 'the selected step'}. Use Edit chain to assign them to steps.`
              }
            >
              {materials?.for_reuse.length ? (
                <div className="chain-materials-section">
                  <small>For reuse</small>
                  {materials.for_reuse.map((lot) => (
                    <MaterialCard
                      key={lot.id}
                      lot={lot}
                      readOnly={!isRunning}
                      selected={isRunning ? selectedInputLotId === lot.id : assignedItemIds.has(lot.item_id)}
                      onSelect={() => isRunning && setSelectedInputLotId(lot.id)}
                    />
                  ))}
                </div>
              ) : null}
              <div className="chain-materials-section">
                {materials?.eligible.length ? materials.eligible.map((lot) => (
                  <MaterialCard
                    key={lot.id}
                    lot={lot}
                    readOnly={!isRunning}
                    selected={isRunning ? selectedInputLotId === lot.id : assignedItemIds.has(lot.item_id)}
                    onSelect={() => isRunning && setSelectedInputLotId(lot.id)}
                  />
                )) : <p className="muted">{isRunning ? 'No eligible lots.' : 'No eligible lots for this step.'}</p>}
              </div>
              {materials?.ineligible.length ? (
                <details className="chain-materials-ineligible">
                  <summary>Not eligible here ({materials.ineligible.length})</summary>
                  {materials.ineligible.map(({ lot, reason }) => (
                    <p key={lot.id} className="muted"><strong>{lot.item_name}</strong> · {reason}</p>
                  ))}
                </details>
              ) : null}
            </ChainLibraryPanel>
          )}
        </aside>

        <div
          className="chain-map-stage"
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
          onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
          onDrop={(e) => void handleDropProcess(e)}
        >
          <div className="chain-map-main">
            <div className="chain-map-input">
              {chainInputLabel(chain)}
              <b>{plannedInput} {unit}</b>
            </div>
            {steps.map((step) => {
              const lineQtys: Record<string, string> = {};
              for (const line of step.lines) lineQtys[line.id] = lineQtyForStep(step, line);
              const inputSatisfied = Boolean(stepAssignments[step.id]);
              const linesEditable = planningMode
                ? inputSatisfied
                : (!run || (isDraft && !isReadOnly) || step.status === 'ACTIVE');
              const stepMassBalance = massBalanceForStep(
                step,
                unit,
                lineQtys,
                mainOverrides[step.id],
              );
              return (
                <StepNode
                  key={step.id}
                  step={step}
                  unit={unit}
                  selected={step.id === (selectedStep?.id ?? '')}
                  editable={planningMode ? inputSatisfied : (!run || (isDraft && !isReadOnly))}
                  linesEditable={linesEditable}
                  planningMode={planningMode}
                  inputSatisfied={inputSatisfied}
                  assignedInput={stepAssignments[step.id] ?? null}
                  mainOverride={mainOverrides[step.id]}
                  lineQtys={lineQtys}
                  massBalance={stepMassBalance}
                  onSelect={() => setSelectedStepId(step.id)}
                  onMainChange={(value) => setMainOverrides((current) => ({ ...current, [step.id]: value }))}
                  onLineQtyChange={(lineId, value) => updateLineQty(step, lineId, value)}
                  onAssignItem={(itemId) => assignItemToStep(step.id, itemId)}
                  onClearInput={() => clearStepInput(step.id)}
                />
              );
            })}
            {editMode && !isRunning && (isDraft || !run) && <div className="chain-map-drop">Drop process here</div>}
          </div>
          {selectedStep ? (
            <aside className="chain-yield-float" aria-label="Yield profile">
              <h4 className="chain-yield-float-title">{selectedStep.process_type_name ?? 'Process'}</h4>
              <p className="chain-yield-float-label">Yield profile</p>
              <ul className="chain-map-yield-list chain-yield-float-list">
                {selectedStep.lines.map((line) => (
                  <li key={line.id}>
                    {line.kind}: {line.item_name} {line.expected_pct ?? 0}%
                    {line.expected_min_pct != null || line.expected_max_pct != null
                      ? ` (${line.expected_min_pct ?? '—'}–${line.expected_max_pct ?? '—'}%)`
                      : ''}
                  </li>
                ))}
              </ul>
              {varianceSummary?.length ? (
                <>
                  <p className="chain-yield-float-label">Variance summary</p>
                  <ul className="chain-map-yield-list chain-yield-float-list">
                    {varianceSummary.map((entry) => (
                      <li key={entry.name}>
                        {entry.name}: {entry.delta >= 0 ? '+' : ''}{baseToDisplay(entry.delta, unit)} {unit}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </aside>
          ) : null}
        </div>
      </div>

      {selectedStep && isRunning && selectedStep.status === 'ACTIVE' && (
        <div className="chain-actuals-panel">
          <div className="chain-actuals-form">
            <h5>Enter actuals — {selectedStep.process_type_name ?? 'active step'}</h5>
            <p className="muted chain-actuals-hint">
              Enter main output and by-products only. Waste is calculated as input minus what you accounted for.
            </p>
            {selectedInputLotId ? (
              <p className="chain-actuals-lot muted">Input lot selected from materials.</p>
            ) : (
              <p className="chain-actuals-lot chain-input-over">Select an input lot from Available materials.</p>
            )}
            {activeMassBalance?.overInput ? (
              <p className="chain-actuals-warning">
                Output and by-products ({activeMassBalance.totalOutDisplay} {unit.toLowerCase()}) exceed input ({activeMassBalance.inputDisplay} {unit.toLowerCase()}).
              </p>
            ) : null}
            {selectedStep.lines.filter((line) => line.kind !== 'loss').map((line) => (
              <label key={line.id} className="chain-actual-line">
                <span>
                  <strong>{lineKindLabel(line.kind)}</strong>
                  {' '}{line.item_name ?? line.kind}
                </span>
                <div className="chain-actual-line-inputs">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={actualDraft[line.id]?.qty ?? ''}
                    onChange={(event) => setActualDraft((current) => ({
                      ...current,
                      [line.id]: { ...current[line.id], qty: event.target.value, godownId: current[line.id]?.godownId ?? '' },
                    }))}
                    aria-label={`${lineKindLabel(line.kind)} quantity for ${line.item_name ?? line.kind}`}
                  />
                  <span>{unit.toLowerCase()}</span>
                  {line.kind === 'byproduct' && (
                    <Select
                      value={actualDraft[line.id]?.godownId ?? ''}
                      onChange={(event) => setActualDraft((current) => ({
                        ...current,
                        [line.id]: { ...current[line.id], godownId: event.target.value, qty: current[line.id]?.qty ?? '' },
                      }))}
                      aria-label={`Godown for ${line.item_name}`}
                    >
                      <option value="">Choose godown</option>
                      {godowns.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </Select>
                  )}
                </div>
              </label>
            ))}
            {selectedStep.lines.some((line) => line.kind === 'loss') && activeMassBalance ? (
              <p className="chain-actuals-waste muted">
                Waste (calculated): <strong>{activeMassBalance.lossDisplay} {unit.toLowerCase()}</strong>
              </p>
            ) : null}
            <div className="chain-actuals-actions">
              <Button type="button" disabled={busy || activeMassBalance?.overInput} onClick={() => void handlePostActuals()}>Post step</Button>
              <Button type="button" className="secondary" disabled={busy} onClick={() => void handleSkipStep()}>Skip step</Button>
            </div>
          </div>
        </div>
      )}
      {selectedStep?.status === 'COMPLETED' && selectedStep.lines.filter((l) => l.kind === 'byproduct' && l.lot_id).map((line) => (
        <div key={line.id} className="chain-disposition-actions">
          <span>{line.item_name} · {line.lot_code}</span>
          <Button type="button" className="secondary" onClick={() => void handleDisposition(line.lot_id!, 'FOR_SALE')}>Mark for sale</Button>
          <Button type="button" className="secondary" onClick={() => void handleDisposition(line.lot_id!, 'FOR_REUSE')}>Mark for reuse</Button>
        </div>
      ))}

      <div className="chain-recent-runs">
        <TableCard
          title="Recent chain runs"
          subtitle="Inputs, outputs and by-products remain linked to the stock ledger."
          actions={
            <TableEditModeButton
              enabled={canVoidRun}
              editMode={tableEdit.editMode}
              onToggle={tableEdit.toggleEditMode}
            />
          }
        >
          <DataTable columns={withEditModeColumns(CHAIN_RUN_COLUMNS_BASE, tableEdit.editMode, { canEdit: canVoidRun })}>
            {recentRuns.length ? recentRuns.map((entry) => (
              <tr key={entry.id}>
                {tableEdit.editMode && canVoidRun && (
                  entry.status === 'COMPLETED'
                    ? <TableEditCell label={entry.code || entry.chain_name || 'chain run'} onClick={() => void handleVoidRun(entry)} />
                    : <td className="table-edit-col" />
                )}
                <td>{entry.end_date ?? entry.start_date ?? '—'}</td>
                <td>
                  <button type="button" className="chain-recent-run-link" onClick={() => void loadHistoricalRun(entry.id)}>
                    <strong>{entry.chain_name ?? chain.name}</strong>
                    {entry.code ? <small>{entry.code}</small> : null}
                  </button>
                </td>
                <td>{formatChainRunLinesSummary(entry)}</td>
                <td>{entry.creator_name ?? '—'}</td>
                <td>
                  <Badge tone={entry.status === 'COMPLETED' ? 'success' : 'neutral'}>
                    {chainRunStatusLabel(entry.status)}
                  </Badge>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={withEditModeColumns(CHAIN_RUN_COLUMNS_BASE, tableEdit.editMode, { canEdit: canVoidRun }).length}>
                  <EmptyState>No started chain runs yet. Create a draft, start the run, and post a step to see it here.</EmptyState>
                </td>
              </tr>
            )}
          </DataTable>
        </TableCard>
      </div>

      {historyOpen && (
        <div className="chain-history-drawer" role="dialog" aria-label="Run history">
          <div className="chain-history-panel">
            <div className="chain-history-head">
              <strong>Run history (last 30 days)</strong>
              <button type="button" onClick={() => setHistoryOpen(false)}>Close</button>
            </div>
            <ul>
              {history.length ? history.map((entry) => (
                <li key={entry.id}>
                  <button type="button" onClick={() => void loadHistoricalRun(entry.id)}>
                    <strong>{entry.code}</strong> · {entry.status} · {entry.start_date}
                  </button>
                </li>
              )) : <li className="muted">No runs in this period.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProcessChainClassic({
  chains,
  types,
  preferredUnit,
  canStartRun,
  onError,
}: {
  chains: ProcessingChainRecord[];
  types: CatalogProcessType[];
  preferredUnit?: string | null;
  canStartRun: boolean;
  onError: (message: string | null) => void;
}) {
  const [selectedChainId, setSelectedChainId] = useState(chains[0]?.id ?? '');

  useEffect(() => {
    if (!chains.length) {
      setSelectedChainId('');
      return;
    }
    if (!chains.some((chain) => chain.id === selectedChainId)) {
      setSelectedChainId(chains[0].id);
    }
  }, [chains, selectedChainId]);

  const selectedChain = chains.find((chain) => chain.id === selectedChainId) ?? null;

  if (!chains.length) {
    return (
      <div className="process-studio-empty-state">
        <p className="muted">No processing chains yet. Configure a chain in Studio view to use the classic pipeline forecast.</p>
      </div>
    );
  }

  return (
    <div className="process-chain-classic-shell">
      <div className="process-studio-chain-bar">
        <Field label="Processing chain">
          <Select value={selectedChainId} onChange={(event) => setSelectedChainId(event.target.value)} aria-label="Processing chain">
            {chains.map((chain) => <option key={chain.id} value={chain.id}>{chain.name}</option>)}
          </Select>
        </Field>
      </div>
      {selectedChain && (
        <ClassicChainMap
          chain={selectedChain}
          types={types}
          preferredUnit={preferredUnit}
          canStartRun={canStartRun}
          onError={onError}
        />
      )}
    </div>
  );
}
