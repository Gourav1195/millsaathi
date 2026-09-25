'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogProcessType } from './process-catalog';
import { Badge, Button, DataTable, EmptyState, Field, Input, Select, TableCard } from './ui';
import { TableEditCell, TableEditModeButton } from './table-edit-mode';
import { can } from '../lib/permissions';
import { useSession } from '../lib/session';
import { useTableEditMode, withEditModeColumns } from '../lib/table-edit-mode';
import {
  acceptedInputLabel,
  classifyItemsForProcess,
  classifyLotsForProcess,
  classicUnits,
  computeClassicForecast,
  formatLotProvenance,
  inputConfigurationMessage,
  itemMatchesProcessInput,
  lotMatchesProcessInput,
  mainOutputItemName,
  processNeedsInputConfiguration,
  roundClassicQty,
  type CatalogItem,
} from '../lib/process-chain-classic';
import type { ProcessingChainRecord } from '../lib/process-studio';
import { formatDualQuantity, itemUsesVariableBags } from '../../../shared/quantity';
import {
  baseToDisplay,
  createChainRun,
  displayToBase,
  formatVarianceLabel,
  loadAvailableInputs,
  loadChainRun,
  loadChainRunHistory,
  massBalanceForStep,
  parseDisplayQty,
  patchChainRun,
  patchChainRunSteps,
  postStepActuals,
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
  type InputAllocationDraft,
  type StockInputGroup,
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
const STOCK_DRAG_TYPE = 'application/millsaathi-stock-lots';

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 7l1 14h10l1-14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

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
      <small>{formatLotProvenance(lot)}{lot.for_reuse ? ' · For reuse' : ''}</small>
    </button>
  );
}

function FlowArrow({
  label,
  forecastQty,
  actualQty,
  unit,
  posted,
}: {
  label: string;
  forecastQty: number;
  actualQty: number | null;
  unit: string;
  posted: boolean;
}) {
  const qtyLabel = posted && actualQty != null
    ? `Actual ${actualQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit.toLowerCase()}`
    : `Forecast ${forecastQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit.toLowerCase()}`;
  return (
    <div className="chain-map-arrow" aria-label={`${label}: ${qtyLabel}`}>
      <b>{label}</b>
      <small>{qtyLabel}</small>
      <i aria-hidden="true">→</i>
    </div>
  );
}

function StepInputSlot({
  step,
  processType,
  unit,
  inputLabel,
  inputAllocations,
  selectedInputLotId,
  availableLots,
  canEdit,
  fieldError,
  onDropStock,
  onClearAll,
  onToggleAllocation,
  onSelectLot,
  onConfigureProcess,
}: {
  step: ChainRunStep;
  processType?: CatalogProcessType;
  unit: string;
  inputLabel: string;
  inputAllocations: InputAllocationDraft[];
  selectedInputLotId: string;
  availableLots: AvailableLot[];
  canEdit: boolean;
  fieldError?: string;
  onDropStock: (event: React.DragEvent) => void;
  onClearAll: () => void;
  onToggleAllocation: (lotId: string, maxDisplay: number, enabled: boolean, quantityDisplay?: string) => void;
  onSelectLot: (lotId: string) => void;
  onConfigureProcess?: () => void;
}) {
  const needsConfiguration = processNeedsInputConfiguration(processType);
  const isFirstStep = step.step_number === 1;
  const selectedLot = selectedInputLotId ? availableLots.find((lot) => lot.id === selectedInputLotId) : null;
  const inputDisplay = baseToDisplay(step.actual_input_base ?? step.forecast_input_base, unit);

  return (
    <div
      className={`chain-map-input-slot-panel${fieldError ? ' chain-map-input-slot-panel--error' : ''}`}
      onDrop={onDropStock}
      onDragOver={(event) => {
        if (canEdit && event.dataTransfer.types.includes(STOCK_DRAG_TYPE)) {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
    >
      <div className="chain-map-input-head">
        <span className="chain-map-input-title">
          {needsConfiguration ? 'Input not configured' : `Drop ${inputLabel} here`}
        </span>
        {canEdit && inputAllocations.length > 0 ? (
          <button type="button" className="chain-map-input-clear-all" onClick={onClearAll}>Remove all</button>
        ) : null}
      </div>
      {needsConfiguration ? (
        <div className="chain-config-action">
          <p>{inputConfigurationMessage(processType?.name)}</p>
          {onConfigureProcess ? (
            <Button type="button" className="secondary" onClick={onConfigureProcess}>
              Configure {processType?.name ?? 'process'}
            </Button>
          ) : (
            <p className="muted">Ask an admin to configure accepted input items in All processes.</p>
          )}
        </div>
      ) : isFirstStep ? (
        <>
          {inputAllocations.length ? null : (
            <b className="chain-map-input-placeholder">Click a lot in Available materials or drag stock here</b>
          )}
          {inputAllocations.map((entry) => {
            const lot = availableLots.find((candidate) => candidate.id === entry.lot_id);
            const maxDisplay = lot ? baseToDisplay(lot.qty_kg, unit) : 0;
            const variableBagLot = lot ? itemUsesVariableBags(lot.tracking_mode) : false;
            const remainingDisplay = lot ? baseToDisplay(lot.qty_kg - displayToBase(Number(entry.quantity_display), unit), unit) : null;
            return (
              <div key={entry.lot_id} className="chain-stock-selection">
                <div className="chain-stock-selection-head">
                  <span className="chain-stock-selection-name">{formatLotProvenance(lot ?? { id: entry.lot_id, code: entry.lot_id, item_id: '', item_name: 'Selected stock', qty_kg: 0 })}</span>
                  {canEdit ? (
                    <button type="button" className="chain-stock-selection-delete" aria-label="Remove stock lot" onClick={() => onToggleAllocation(entry.lot_id, 0, false)}>
                      <TrashIcon />
                    </button>
                  ) : null}
                </div>
                <label className="chain-stock-selection-qty">
                  <span>{variableBagLot ? 'Whole lot' : 'Entered'}</span>
                  <input type="number" min="0" step="0.01" max={maxDisplay || undefined} disabled={!canEdit || variableBagLot} readOnly={variableBagLot} value={entry.quantity_display}
                    aria-label={`Quantity from ${lot?.code ?? entry.lot_id}`}
                    onChange={(event) => onToggleAllocation(entry.lot_id, maxDisplay, true, event.target.value)} />
                  <span className="chain-stock-selection-unit">{unit}</span>
                </label>
                {variableBagLot && lot ? (
                  <small>
                    {formatDualQuantity({ weightKg: lot.qty_kg, bagCount: lot.bag_count, trackingMode: 'VARIABLE_BAG' })}
                    {' · '}This item uses variable-weight bags, so processing uses the complete lot.
                  </small>
                ) : (
                  <small>Available {maxDisplay} {unit} · Remaining after posting {remainingDisplay ?? '—'} {unit}</small>
                )}
              </div>
            );
          })}
        </>
      ) : selectedLot ? (
        <div className="chain-stock-selection">
          <div className="chain-stock-selection-head">
            <span className="chain-stock-selection-name">{formatLotProvenance(selectedLot)}</span>
            {canEdit ? (
              <button type="button" className="chain-stock-selection-delete" aria-label="Clear selected lot" onClick={() => onSelectLot('')}>
                <TrashIcon />
              </button>
            ) : null}
          </div>
          <small>Lot {selectedLot.code} · Available {baseToDisplay(selectedLot.qty_kg, unit)} {unit}</small>
          <small>Entered {inputDisplay} {unit} · Remaining after posting {baseToDisplay(Math.max(0, selectedLot.qty_kg - displayToBase(inputDisplay, unit)), unit)} {unit}</small>
        </div>
      ) : (
        <b className="chain-map-input-placeholder">Select the previous step output lot from Available materials</b>
      )}
      {fieldError ? <small className="chain-field-error">{fieldError}</small> : null}
      {!needsConfiguration ? <small>Draft saves do not consume stock. Inventory is deducted when you post this step.</small> : null}
    </div>
  );
}

function GroupedStockCard({
  group,
  unit,
  expanded,
  selectedAllocations,
  readOnly,
  onToggleExpand,
  onToggleAllocation,
}: {
  group: StockInputGroup;
  unit: string;
  expanded: boolean;
  selectedAllocations: InputAllocationDraft[];
  readOnly?: boolean;
  onToggleExpand: () => void;
  onToggleAllocation: (lotId: string, maxDisplay: number, enabled: boolean, quantityDisplay?: string) => void;
}) {
  const totalDisplay = baseToDisplay(group.total_available_kg, unit);
  const selectedIds = new Set(selectedAllocations.map((entry) => entry.lot_id));
  const hasSelection = group.allocations.some((allocation) => selectedIds.has(allocation.lot_id));

  return (
    <div className={`process-material process-material--group${hasSelection ? ' used' : ''}`}>
      <button type="button" className="process-material-group-head" onClick={onToggleExpand}
        draggable={!readOnly}
        onDragStart={(event) => {
          event.dataTransfer.setData(STOCK_DRAG_TYPE, JSON.stringify(group.allocations.map((entry) => entry.lot_id)));
          event.dataTransfer.effectAllowed = 'copy';
        }}>
        <span className="process-material-head">
          <span>
            <strong>{group.item_name}</strong>
            <small>{group.sauda_code ?? 'Unlinked stock'}</small>
          </span>
          <b>{expanded ? 'Hide' : 'Show'} godowns</b>
        </span>
        <span className="process-material-qty">{totalDisplay.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit.toLowerCase()} available</span>
        <small>{group.allocations.length} godown allocation{group.allocations.length === 1 ? '' : 's'}</small>
      </button>
      {expanded ? (
        <div className="process-material-allocations">
          {group.allocations.map((allocation) => {
            const maxDisplay = baseToDisplay(allocation.available_kg, unit);
            const selected = selectedIds.has(allocation.lot_id);
            const draft = selectedAllocations.find((entry) => entry.lot_id === allocation.lot_id);
            return (
              <label key={allocation.lot_id} className="process-material-allocation">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={readOnly}
                  onChange={(event) => onToggleAllocation(allocation.lot_id, maxDisplay, event.target.checked)}
                />
                <span>
                  <strong draggable={!readOnly} onDragStart={(event) => {
                    event.stopPropagation();
                    event.dataTransfer.setData(STOCK_DRAG_TYPE, JSON.stringify([allocation.lot_id]));
                    event.dataTransfer.effectAllowed = 'copy';
                  }}>{allocation.godown_name ?? 'No godown'}</strong>
                  <small>{allocation.lot_code} · {maxDisplay.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit.toLowerCase()} available · {group.sauda_code ?? 'Unlinked'}{group.item_name ? ` · ${group.item_name}` : ''}</small>
                </span>
                {selected && !readOnly ? (
                  <input
                    type="number"
                    min="0"
                    max={maxDisplay}
                    step="0.001"
                    value={draft?.quantity_display ?? ''}
                    onChange={(event) => onToggleAllocation(allocation.lot_id, maxDisplay, true, event.target.value)}
                    aria-label={`Quantity from ${allocation.godown_name ?? allocation.lot_code}`}
                  />
                ) : null}
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
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
  const inputDisplay = baseToDisplay(step.actual_input_base ?? step.forecast_input_base, unit);
  const inputPosted = step.actual_input_base != null;
  const tone = mainLine && !blankPlanning ? varianceTone(Number(displayMain), mainLine.expected_min_pct, mainLine.expected_max_pct) : 'neutral';
  const statusLabel = planningMode && !inputSatisfied
    ? 'Needs input'
    : step.status === 'ACTIVE'
      ? 'Current step'
      : step.status === 'COMPLETED'
        ? 'Posted'
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
              {inputPosted ? 'Actual input' : 'Forecast input'} <b>{assignedInput ? assignedInput.itemName : `${inputDisplay} ${unit}`}</b>
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
              {step.status === 'COMPLETED' ? 'Actual output' : 'Forecast output'}
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
                  <span className="chain-map-byproduct-kind">{isComputedLoss ? 'Waste (calculated)' : line.kind === 'byproduct' ? 'By-product · to stock' : lineKindLabel(line.kind)}</span>
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
  canConfigureProcesses,
  onConfigureProcess,
  onError,
}: {
  chain: ProcessingChainRecord;
  types: CatalogProcessType[];
  preferredUnit?: string | null;
  canStartRun: boolean;
  canConfigureProcesses?: boolean;
  onConfigureProcess?: (processTypeId: string) => void;
  onError: (message: string | null) => void;
}) {
  const { session } = useSession();
  const tableEdit = useTableEditMode();
  const canVoidRun = can(session, 'processing:void');
  const cardRef = useRef<HTMLDivElement>(null);
  const unitOptions = useMemo(() => classicUnits(preferredUnit), [preferredUnit]);
  const [unit, setUnit] = useState(unitOptions[0] ?? 'Quintal');
  const [plannedInput, setPlannedInput] = useState(0);
  const [runDetail, setRunDetail] = useState<ChainRunDetail | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ChainRunListItem[]>([]);
  const [recentRuns, setRecentRuns] = useState<ChainRunListItem[]>([]);
  const [materials, setMaterials] = useState<{
    groups: StockInputGroup[];
    reuse_groups: StockInputGroup[];
    eligible: AvailableLot[];
    for_reuse: AvailableLot[];
    ineligible: { lot: AvailableLot; reason: string }[];
  } | null>(null);
  const [materialItemFilter, setMaterialItemFilter] = useState('');
  const [materialGodownFilter, setMaterialGodownFilter] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [inputAllocations, setInputAllocations] = useState<InputAllocationDraft[]>([]);
  const [processingInputQty, setProcessingInputQty] = useState('');
  const [selectedInputLotId, setSelectedInputLotId] = useState('');
  const [actualDraft, setActualDraft] = useState<Record<string, { qty: string; godownId: string }>>({});
  const [godowns, setGodowns] = useState<{ id: string; name: string }[]>([]);
  const [mainOverrides, setMainOverrides] = useState<Record<string, number>>({});
  const [lineOverrides, setLineOverrides] = useState<Record<string, string>>({});
  const [stepAssignments, setStepAssignments] = useState<Record<string, StepInputAssignment>>({});
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [workspaceLots, setWorkspaceLots] = useState<AvailableLot[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
      let detail = await createChainRun(chain.id, plannedInput, unit);
      if (inputAllocations.length) {
        detail = await patchChainRun(detail.chain_run.id, { planned_input: plannedInput, unit,
          input_allocations: inputAllocations.map((entry) => ({ lot_id: entry.lot_id, quantity_base: displayToBase(Number(entry.quantity_display), unit) })) });
      }
      setRunDetail(detail);
      setSelectedStepId(detail.run_steps[0]?.id ?? '');
      const history = await loadChainRunHistory(chain.id);
      setRecentRuns(history.chain_runs.slice(0, 8));
      return detail.chain_run.id;
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not create draft run');
      return null;
    } finally {
      setBusy(false);
    }
  }, [chain.id, onError, plannedInput, run?.status, run?.id, unit, inputAllocations]);

  const loadRecentRuns = useCallback(async () => {
    try {
      const body = await loadChainRunHistory(chain.id);
      const visible = body.chain_runs;
      setRecentRuns(visible.slice(0, 8));
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load recent chain runs');
    }
  }, [chain.id, onError]);

  function returnToChainTemplate() {
    setInputAllocations([]);
    setPlannedInput(0);
    setProcessingInputQty('');
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
    setInputAllocations([]);
    setPlannedInput(0);
    setProcessingInputQty('');
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
  const planningMode = editMode && !isRunning && !isReadOnly;
  const canSelectStock = canStartRun && !busy && !isReadOnly && !planningMode && Boolean(selectedStep) && (
    (selectedStep!.step_number === 1 && (!isRunning || selectedStep!.status === 'ACTIVE' || isDraft)) ||
    (selectedStep!.step_number > 1 && isRunning && selectedStep!.status === 'ACTIVE')
  );
  const needsInputConfiguration = processNeedsInputConfiguration(selectedProcessType);

  function configureSelectedProcess() {
    const processTypeId = selectedProcessType?.id ?? selectedStep?.process_type_id;
    if (!processTypeId || !onConfigureProcess) return;
    onConfigureProcess(processTypeId);
  }

  const assignedItemIds = useMemo(
    () => new Set(Object.values(stepAssignments).map((assignment) => assignment.itemId)),
    [stepAssignments],
  );

  const classifiedItems = useMemo(
    () => classifyItemsForProcess(selectedProcessType, catalogItems),
    [selectedProcessType, catalogItems],
  );

  const availableLots = useMemo(
    () => [...(materials?.eligible ?? []), ...(materials?.for_reuse ?? [])],
    [materials],
  );

  function selectInputLot(lotId: string) {
    if (!canSelectStock) return;
    if (!lotId) {
      setSelectedInputLotId('');
      return;
    }
    const lot = availableLots.find((entry) => entry.id === lotId);
    if (!lot) {
      onError('This lot is no longer available.');
      return;
    }
    if (!lotMatchesProcessInput(selectedProcessType, lot)) {
      onError(`${lot.item_name} is not accepted by ${selectedStep?.process_type_name ?? 'this process'}.`);
      return;
    }
    onError(null);
    setFieldErrors((current) => { const next = { ...current }; delete next.__input__; return next; });
    setSelectedInputLotId(lotId);
  }

  function toggleInputAllocation(lotId: string, maxDisplay: number, enabled: boolean, quantityDisplay?: string) {
    if (!canSelectStock) return;
    if (needsInputConfiguration) {
      onError(inputConfigurationMessage(selectedProcessType?.name));
      return;
    }
    const lot = availableLots.find((entry) => entry.id === lotId);
    if (enabled && lot && !lotMatchesProcessInput(selectedProcessType, lot)) {
      onError(`${lot.item_name} is not accepted by ${selectedStep?.process_type_name ?? 'this process'}.`);
      return;
    }
    if (enabled && inputAllocations.some((entry) => availableLots.find((candidate) => candidate.id === entry.lot_id)?.item_id !== lot?.item_id)) {
      onError('Choose stock lots of the same material. Remove the current selection to change material.');
      return;
    }
    onError(null);
    setInputAllocations((current) => {
      if (!enabled) return current.filter((entry) => entry.lot_id !== lotId);
      const forceWholeLot = lot ? itemUsesVariableBags(lot.tracking_mode) : false;
      const nextQty = forceWholeLot ? String(maxDisplay) : (quantityDisplay ?? String(maxDisplay));
      const existingIndex = current.findIndex((entry) => entry.lot_id === lotId);
      if (existingIndex >= 0) {
        return current.map((entry) => (
          entry.lot_id === lotId ? { ...entry, quantity_display: nextQty } : entry
        ));
      }
      return [...current, { lot_id: lotId, quantity_display: nextQty }];
    });
    if (enabled && quantityDisplay == null) {
      setSelectedInputLotId(lotId);
    }
  }

  function clearAllInputAllocations() {
    if (!canSelectStock || !inputAllocations.length) return;
    onError(null);
    setInputAllocations([]);
  }

  function toggleExpandedGroup(groupKey: string) {
    setExpandedGroups((current) => ({ ...current, [groupKey]: !current[groupKey] }));
  }

  const allocatedInputDisplay = useMemo(() => {
    return roundClassicQty(inputAllocations.reduce((sum, entry) => sum + (parseDisplayQty(entry.quantity_display) ?? 0), 0));
  }, [inputAllocations]);

  useEffect(() => {
    if (isReadOnly || (isRunning && steps[0]?.status !== 'ACTIVE')) return;
    setPlannedInput(allocatedInputDisplay);
    setProcessingInputQty(allocatedInputDisplay ? String(allocatedInputDisplay) : '');
  }, [allocatedInputDisplay, isRunning, isReadOnly, steps[0]?.status]);

  function dropStock(event: React.DragEvent) {
    const raw = event.dataTransfer.getData(STOCK_DRAG_TYPE);
    if (!raw || !canSelectStock) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('drag-over');
    if (needsInputConfiguration) {
      onError(inputConfigurationMessage(selectedProcessType?.name));
      return;
    }
    try {
      const ids: unknown = JSON.parse(raw);
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return;
      if (selectedStep && selectedStep.step_number > 1) {
        if (ids.length !== 1) {
          onError('Drop one output lot from the previous posted step.');
          return;
        }
        selectInputLot(String(ids[0]));
        return;
      }
      const lots = ids.map((id) => availableLots.find((lot) => lot.id === id));
      if (lots.some((lot) => !lot)) {
        onError('One of the dropped lots is no longer available.');
        return;
      }
      for (const lot of lots) {
        if (!lotMatchesProcessInput(selectedProcessType, lot!)) {
          onError(`${lot!.item_name} is not accepted by ${selectedStep?.process_type_name ?? 'this process'}.`);
          return;
        }
      }
      if (new Set([...lots.map((lot) => lot!.item_id), ...inputAllocations.map((entry) => availableLots.find((lot) => lot.id === entry.lot_id)?.item_id)]).size > 1) {
        onError('Choose available stock of the same material.');
        return;
      }
      setInputAllocations((current) => [...current, ...lots.filter((lot) => !current.some((entry) => entry.lot_id === lot!.id)).map((lot) => ({ lot_id: lot!.id, quantity_display: String(baseToDisplay(lot!.qty_kg, unit)) }))]);
      setFieldErrors((current) => { const next = { ...current }; delete next.__input__; return next; });
      onError(null);
    } catch { onError('Drag a stock card from Available materials.'); }
  }

  const stockGroups = materials?.groups ?? [];
  const reuseStockGroups = materials?.reuse_groups ?? [];
  const materialItemOptions = useMemo(
    () => [...new Set(stockGroups.map((group) => group.item_name))].sort(),
    [stockGroups],
  );
  const materialGodownOptions = useMemo(
    () => [...new Set(stockGroups.flatMap((group) => group.allocations.map((allocation) => allocation.godown_name).filter(Boolean) as string[]))].sort(),
    [stockGroups],
  );
  const filteredStockGroups = useMemo(() => {
    return stockGroups.filter((group) => {
      if (materialItemFilter && group.item_name !== materialItemFilter) return false;
      if (materialGodownFilter && !group.allocations.some((allocation) => allocation.godown_name === materialGodownFilter)) return false;
      return true;
    });
  }, [stockGroups, materialItemFilter, materialGodownFilter]);

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
    let cancelled = false;
    const materialStep = selectedStep ?? steps[0];
    if (!materialStep?.id) {
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
      void loadAvailableInputs(run.id, materialStep.id)
        .then((body) => {
          if (cancelled) return;
          setMaterials({
            groups: body.groups,
            reuse_groups: body.reuse_groups,
            eligible: body.eligible,
            for_reuse: body.for_reuse,
            ineligible: body.ineligible,
          });
        })
        .catch((cause: unknown) => onError(cause instanceof Error ? cause.message : 'Could not load materials'));
      setWorkspaceLots([]);
      return () => { cancelled = true; };
    }

    if (!materialStep.process_type_id) {
      setMaterials(null);
      return;
    }

    void fetch(`/api/process-workspace?process_type_id=${encodeURIComponent(materialStep.process_type_id)}`, { credentials: 'include' })
      .then((response) => response.json())
      .then((body: { lots?: AvailableLot[]; stock_groups?: StockInputGroup[]; error?: string }) => {
        if (cancelled) return;
        if (body.error) throw new Error(body.error);
        const lots = (body.lots ?? []).map((lot) => ({
          ...lot,
          disposition: lot.disposition ?? 'STOCK',
        }));
        setWorkspaceLots(lots);
        const classified = classifyLotsForProcess(selectedProcessType, lots);
        setMaterials({
          groups: (body.stock_groups ?? []).filter((group) => classified.eligible.some((lot) => lot.item_id === group.item_id)),
          reuse_groups: [],
          ...classified,
        });
      })
      .catch((cause: unknown) => onError(cause instanceof Error ? cause.message : 'Could not load materials'));
    return () => { cancelled = true; };
  }, [run?.id, selectedStep?.id, steps[0]?.id, selectedStep?.process_type_id, isReadOnly, isRunning, editMode, selectedProcessType, onError]);

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
      await patchChainRun(run.id, { planned_input: allocatedInputDisplay, unit,
        input_allocations: inputAllocations.map((entry) => ({ lot_id: entry.lot_id, quantity_base: displayToBase(Number(entry.quantity_display), unit) })) });
      const detail = await startChainRun(run.id);
      setRunDetail(detail);
      setEditMode(false);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not start run');
    } finally {
      setBusy(false);
    }
  }

  async function saveInputDraft() {
    if (!run) { await ensureDraft(); return; }
    setBusy(true);
    try {
      const detail = await patchChainRun(run.id, { planned_input: allocatedInputDisplay, unit,
        input_allocations: inputAllocations.map((entry) => ({ lot_id: entry.lot_id, quantity_base: displayToBase(Number(entry.quantity_display), unit) })) });
      setRunDetail(detail);
      onError(null);
      await loadRecentRuns();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Could not save input'); }
    finally { setBusy(false); }
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
    const inputQty = selectedStep.step_number === 1
      ? parseDisplayQty(processingInputQty)
      : baseToDisplay(selectedStep.forecast_input_base, unit);
    const validation = validateStepActuals({
      step: selectedStep,
      unit,
      actualDraft: {
        ...actualDraft,
        __input__: { qty: String(inputQty ?? ''), godownId: '' },
      },
      inputAllocations: selectedStep.step_number === 1 ? inputAllocations : [],
      selectedInputLotId: selectedStep.step_number === 1 ? '' : selectedInputLotId,
      godowns,
      availableLots,
      needsInputConfiguration,
    });
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors ?? {});
      onError(validation.message);
      return;
    }
    setFieldErrors({});
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
      const inputAllocationsPayload = selectedStep.step_number === 1
        ? inputAllocations.map((entry) => ({
          lot_id: entry.lot_id,
          quantity: Number(entry.quantity_display),
          unit,
        }))
        : undefined;
      const detail = await postStepActuals(run.id, selectedStep.id, {
        input_allocations: inputAllocationsPayload,
        input_lot_id: selectedStep.step_number === 1 ? undefined : selectedInputLotId || undefined,
        input_quantity: inputQty ?? undefined,
        lines,
        destination_godown_id: godowns[0]?.id,
        idempotency_key: `${run.id}:${selectedStep.id}`,
      });
      setRunDetail(detail);
      setSelectedInputLotId('');
      setSelectedStepId(detail.run_steps.find((step) => step.status === 'ACTIVE')?.id ?? selectedStep.id);
      setInputAllocations([]);
      setProcessingInputQty('');
      if (detail.chain_run.status === 'COMPLETED') await loadRecentRuns();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not post actuals');
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
      const savedUnit = detail.chain_run.unit ?? 'QUINTAL';
      setUnit(savedUnit);
      setPlannedInput(baseToDisplay(detail.run_steps[0]?.actual_input_base ?? detail.chain_run.planned_input_base, savedUnit));
      setInputAllocations((detail.input_allocations ?? []).map((entry) => ({ lot_id: entry.lot_id, quantity_display: String(baseToDisplay(entry.quantity_base, savedUnit)) })));
      setSelectedStepId(detail.run_steps.find((step) => step.status === 'ACTIVE')?.id ?? detail.run_steps[0]?.id ?? '');
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
      await splitLot(lotId, { quantity: Number(qty), unit, disposition });
      if (run?.id && selectedStep?.id) {
        const mats = await loadAvailableInputs(run.id, selectedStep.id);
        setMaterials({
          groups: mats.groups,
          reuse_groups: mats.reuse_groups,
          eligible: mats.eligible,
          for_reuse: mats.for_reuse,
          ineligible: mats.ineligible,
        });
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
    const inputStep = selectedStep.step_number === 1 && isRunning
      ? { ...selectedStep, forecast_input_base: displayToBase(allocatedInputDisplay, unit) }
      : selectedStep;
    return massBalanceForStep(inputStep, unit, qtyByLineId, mainOverrides[selectedStep.id]);
  }, [selectedStep, unit, actualDraft, mainOverrides, allocatedInputDisplay, isRunning]);

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

  const workflowStatus = useMemo(() => {
    if (isReadOnly) return { title: 'Completed run', detail: 'Read-only audit trail. Stock movements stay linked in the ledger.' };
    if (planningMode) return { title: 'Editing chain layout', detail: 'Assign items to each step and adjust forecast outputs. Stock is not used in edit mode.' };
    if (isRunning && selectedStep?.status === 'ACTIVE') {
      return {
        title: `Step ${selectedStep.step_number}: ${selectedStep.process_type_name ?? 'Active step'}`,
        detail: 'Next action: record actual output and by-products, then post this step. Inventory is consumed when you post.',
      };
    }
    if (isDraft) {
      return {
        title: `Draft${run?.code ? ` · ${run.code}` : ''}`,
        detail: inputAllocations.length
          ? 'Next action: start the run when ready. Saving a draft does not consume stock.'
          : 'Next action: select step 1, choose eligible stock lots, then save a draft or start the run.',
      };
    }
    return {
      title: 'New chain run',
      detail: 'Select step 1, choose stock from Available materials, then save a draft without consuming inventory.',
    };
  }, [isReadOnly, planningMode, isRunning, selectedStep, isDraft, run?.code, inputAllocations.length]);

  function showInputSlotForStep(step: ChainRunStep) {
    if (isReadOnly || planningMode || selectedStep?.id !== step.id) return false;
    if (step.step_number === 1) return !isRunning || step.status === 'ACTIVE' || isDraft;
    return isRunning && step.status === 'ACTIVE';
  }

  return (
    <div ref={cardRef} className={`chain-map-card${fullscreen ? ' chain-map-card--fullscreen' : ''}`}>
      <div className="chain-map-head">
        <div>
          <h3 className="chain-map-title">{chain.name}{run?.code ? ` · ${run.code}` : ''}</h3>
          <p className="muted">
            <strong>{workflowStatus.title}.</strong> {workflowStatus.detail}
          </p>
        </div>
        <div className="chain-map-controls">
          <label>
            First input
            <Input
              type="number"
              min="0"
              step="0.001"
              value={plannedInput || ''}
              placeholder="Select stock"
              disabled
              onChange={(event) => void handlePlannedInputChange(event.target.value)}
              aria-label="First input quantity"
            />
          </label>
          <label>
            Unit
            <Select value={unit} disabled={isRunning || isReadOnly} onChange={(event) => {
              const nextUnit = event.target.value;
              setInputAllocations((current) => current.map((entry) => ({ ...entry, quantity_display: String(baseToDisplay(displayToBase(Number(entry.quantity_display), unit), nextUnit)) })));
              setUnit(nextUnit);
            }} aria-label="Forecast unit">
              {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </label>
          {(!run || isDraft) && !isRunning && !isReadOnly && (
            editMode ? (
              <>
                {canConfigureProcesses && needsInputConfiguration && selectedProcessType ? (
                  <Button type="button" className="secondary" onClick={configureSelectedProcess}>
                    Configure {selectedProcessType.name}
                  </Button>
                ) : null}
                <Button type="button" className="secondary" onClick={exitEditMode}>Done editing</Button>
              </>
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
            <Button type="button" disabled={busy || !steps.length || !inputAllocations.length || allocatedInputDisplay <= 0 || needsInputConfiguration} onClick={() => void handleStartRun()} title="Begin the run. Stock is not consumed until you post step 1.">
              {busy ? 'Starting…' : 'Start run'}
            </Button>
          )}
          {canStartRun && !run && (
            <Button type="button" disabled={busy || needsInputConfiguration} onClick={() => void saveInputDraft()} title="Save lot selections without consuming stock.">
              {busy ? 'Saving…' : 'Save draft (no stock use)'}
            </Button>
          )}
          {canStartRun && run && (isReadOnly || isRunning) && (
            <Button type="button" disabled={busy} onClick={() => void ensureDraft()}>
              {busy ? 'Creating…' : 'New draft run'}
            </Button>
          )}
          {canStartRun && isDraft && run && (
            <Button type="button" disabled={busy || needsInputConfiguration} onClick={() => void saveInputDraft()} title="Save lot selections without consuming stock.">
              Save draft (no stock use)
            </Button>
          )}
        </div>
      </div>

      <div className="chain-map-layout">
        <aside className={`chain-library${editMode ? ' chain-library--edit' : ''}`}>
          {editMode && (
            <>
              <ChainLibraryPanel title="Process library" hint="Drag a process to add it to this run.">
                {libraryTypes.map((type) => <ClassicLibraryItem key={type.id} type={type} />)}
              </ChainLibraryPanel>
              <div className="chain-library-divider" />
            </>
          )}
          {(
            <ChainLibraryPanel
              title="Available materials"
              hint={
                needsInputConfiguration
                  ? inputConfigurationMessage(selectedProcessType?.name)
                  : selectedStep?.step_number === 1
                    ? `Only stock accepted by ${selectedStep?.process_type_name ?? 'the selected step'} is shown.`
                    : isRunning && selectedStep?.step_number > 1
                      ? `Only output lots from the previous posted step are shown for ${selectedStep?.process_type_name ?? 'this step'}.`
                      : `Stock available for ${selectedStep?.process_type_name ?? 'the selected step'}.`
              }
            >
              {needsInputConfiguration ? (
                <div className="chain-config-action">
                  <p>{inputConfigurationMessage(selectedProcessType?.name)}</p>
                  {canConfigureProcesses && onConfigureProcess ? (
                    <Button type="button" className="secondary" onClick={configureSelectedProcess}>
                      Configure {selectedProcessType?.name ?? 'process'}
                    </Button>
                  ) : null}
                </div>
              ) : !isRunning || selectedStep?.step_number === 1 ? (
                <>
                  <div className="chain-materials-filters">
                    <Select value={materialItemFilter} onChange={(event) => setMaterialItemFilter(event.target.value)} aria-label="Filter by material">
                      <option value="">All materials</option>
                      {materialItemOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </Select>
                    <Select value={materialGodownFilter} onChange={(event) => setMaterialGodownFilter(event.target.value)} aria-label="Filter by godown">
                      <option value="">All godowns</option>
                      {materialGodownOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </Select>
                  </div>
                  {reuseStockGroups.length ? (
                    <div className="chain-materials-section">
                      <small>For reuse</small>
                      {reuseStockGroups.map((group) => (
                        <GroupedStockCard
                          key={group.group_key}
                          group={group}
                          unit={unit}
                          expanded={Boolean(expandedGroups[group.group_key])}
                          selectedAllocations={inputAllocations}
                          readOnly={!canSelectStock}
                          onToggleExpand={() => toggleExpandedGroup(group.group_key)}
                          onToggleAllocation={toggleInputAllocation}
                        />
                      ))}
                    </div>
                  ) : null}
                  <div className="chain-materials-section">
                    {filteredStockGroups.length ? filteredStockGroups.map((group) => (
                      <GroupedStockCard
                        key={group.group_key}
                        group={group}
                        unit={unit}
                        expanded={Boolean(expandedGroups[group.group_key])}
                        selectedAllocations={inputAllocations}
                        readOnly={!canSelectStock}
                        onToggleExpand={() => toggleExpandedGroup(group.group_key)}
                        onToggleAllocation={toggleInputAllocation}
                      />
                    )) : <p className="muted">No eligible stock groups.</p>}
                  </div>
                </>
              ) : (
                <div className="chain-materials-section">
                  {materials?.for_reuse.length ? materials.for_reuse.map((lot) => (
                    <MaterialCard
                      key={lot.id}
                      lot={lot}
                      readOnly={!canSelectStock}
                      selected={selectedInputLotId === lot.id}
                      onSelect={() => selectInputLot(lot.id)}
                    />
                  )) : null}
                  {materials?.eligible.length ? materials.eligible.map((lot) => (
                    <MaterialCard
                      key={lot.id}
                      lot={lot}
                      readOnly={!canSelectStock}
                      selected={selectedInputLotId === lot.id}
                      onSelect={() => selectInputLot(lot.id)}
                    />
                  )) : <p className="muted">{isRunning ? 'No eligible lots.' : 'No eligible lots for this step.'}</p>}
                </div>
              )}
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
            {steps.map((step, index) => {
              const stepType = types.find((type) => type.id === step.process_type_id);
              const previousStep = index > 0 ? steps[index - 1] : null;
              const previousType = previousStep ? types.find((type) => type.id === previousStep.process_type_id) : null;
              const flowLabel = previousStep ? mainOutputItemName(previousStep, previousType) : '';
              const lineQtys: Record<string, string> = {};
              for (const line of step.lines) lineQtys[line.id] = lineQtyForStep(step, line);
              const inputSatisfied = step.step_number === 1 ? inputAllocations.length > 0 : Boolean(selectedInputLotId);
              const linesEditable = planningMode
                ? inputSatisfied
                : (!run || (isDraft && !isReadOnly) || step.status === 'ACTIVE');
              const stepMassBalance = massBalanceForStep(step, unit, lineQtys, mainOverrides[step.id]);
              return (
                <div key={step.id} className="chain-map-step-segment">
                  {index > 0 && previousStep ? (
                    <FlowArrow
                      label={flowLabel}
                      forecastQty={baseToDisplay(step.forecast_input_base, unit)}
                      actualQty={previousStep.actual_main_base != null ? baseToDisplay(previousStep.actual_main_base, unit) : null}
                      unit={unit}
                      posted={previousStep.status === 'COMPLETED'}
                    />
                  ) : null}
                  {showInputSlotForStep(step) ? (
                    <StepInputSlot
                      step={step}
                      processType={stepType}
                      unit={unit}
                      inputLabel={acceptedInputLabel(stepType, 'stock')}
                      inputAllocations={inputAllocations}
                      selectedInputLotId={selectedInputLotId}
                      availableLots={availableLots}
                      canEdit={canSelectStock}
                      fieldError={fieldErrors.__input__}
                      onDropStock={dropStock}
                      onClearAll={clearAllInputAllocations}
                      onToggleAllocation={toggleInputAllocation}
                      onSelectLot={selectInputLot}
                      onConfigureProcess={canConfigureProcesses && onConfigureProcess && stepType ? () => onConfigureProcess(stepType.id) : undefined}
                    />
                  ) : null}
                  <StepNode
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
                </div>
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
            <h5>Record and post actuals — {selectedStep.process_type_name ?? 'active step'}</h5>
            <p className="muted chain-actuals-hint">
              Enter main output and by-products only. Waste is calculated as input minus what you accounted for. Inventory is consumed when you post.
            </p>
            {fieldErrors.__input__ ? <p className="chain-field-error">{fieldErrors.__input__}</p> : null}
            {selectedStep.step_number === 1 ? (
              <label className="chain-actual-line">
                <span><strong>Processing input</strong> from selected stock lots</span>
                <div className="chain-actual-line-inputs">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={processingInputQty}
                    readOnly
                    aria-label="Processing input quantity"
                  />
                  <span>{unit.toLowerCase()}</span>
                </div>
              </label>
            ) : null}
            {inputAllocations.length ? (
              <div className="chain-actuals-allocations">
                {inputAllocations.map((entry) => {
                  const lot = availableLots.find((candidate) => candidate.id === entry.lot_id);
                  return (
                    <p key={entry.lot_id} className="muted">
                      {lot?.godown_name ?? lot?.code ?? entry.lot_id}: {entry.quantity_display} {unit.toLowerCase()} available max {lot ? baseToDisplay(lot.qty_kg, unit) : '—'} {unit.toLowerCase()}
                    </p>
                  );
                })}
              </div>
            ) : selectedInputLotId ? (
              <p className="chain-actuals-lot muted">
                {formatLotProvenance(availableLots.find((lot) => lot.id === selectedInputLotId) ?? { id: selectedInputLotId, code: selectedInputLotId, item_id: '', item_name: 'Selected lot', qty_kg: 0 })}
              </p>
            ) : (
              <p className={`chain-actuals-lot${fieldErrors.__input__ ? ' chain-input-over' : ''}`}>Select stock lots from Available materials.</p>
            )}
            {fieldErrors.__balance__ ? <p className="chain-field-error">{fieldErrors.__balance__}</p> : null}
            {activeMassBalance?.overInput && !fieldErrors.__balance__ ? (
              <p className="chain-actuals-warning">
                Output and by-products ({activeMassBalance.totalOutDisplay} {unit.toLowerCase()}) exceed input ({activeMassBalance.inputDisplay} {unit.toLowerCase()}).
              </p>
            ) : null}
            {selectedStep.lines.filter((line) => line.kind !== 'loss').map((line) => (
              <label key={line.id} className={`chain-actual-line${fieldErrors[line.id] ? ' chain-actual-line--error' : ''}`}>
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
                    onChange={(event) => {
                      setFieldErrors((current) => { const next = { ...current }; delete next[line.id]; delete next.__balance__; return next; });
                      setActualDraft((current) => ({
                        ...current,
                        [line.id]: { ...current[line.id], qty: event.target.value, godownId: current[line.id]?.godownId ?? '' },
                      }));
                    }}
                    aria-label={`${lineKindLabel(line.kind)} quantity for ${line.item_name ?? line.kind}`}
                    aria-invalid={Boolean(fieldErrors[line.id])}
                  />
                  <span>{unit.toLowerCase()}</span>
                  {line.kind === 'byproduct' && (
                    <Select
                      value={actualDraft[line.id]?.godownId ?? ''}
                      onChange={(event) => {
                        setFieldErrors((current) => { const next = { ...current }; delete next[line.id]; return next; });
                        setActualDraft((current) => ({
                          ...current,
                          [line.id]: { ...current[line.id], godownId: event.target.value, qty: current[line.id]?.qty ?? '' },
                        }));
                      }}
                      aria-label={`Godown for ${line.item_name}`}
                      aria-invalid={Boolean(fieldErrors[line.id])}
                    >
                      <option value="">Choose godown</option>
                      {godowns.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </Select>
                  )}
                </div>
                {fieldErrors[line.id] ? <small className="chain-field-error">{fieldErrors[line.id]}</small> : null}
              </label>
            ))}
            {selectedStep.lines.some((line) => line.kind === 'loss') && activeMassBalance ? (
              <p className="chain-actuals-waste muted">
                Waste (calculated): <strong>{activeMassBalance.lossDisplay} {unit.toLowerCase()}</strong>
              </p>
            ) : null}
            <div className="chain-actuals-actions">
              <Button type="button" disabled={busy || activeMassBalance?.overInput} onClick={() => void handlePostActuals()} title="Record consumption, outputs, and by-products for this step.">
                {busy ? 'Posting…' : 'Record and post actuals'}
              </Button>
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
          subtitle="Reopen a draft to restore saved input selections. Posted inputs and outputs remain linked to the stock ledger."
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
  canConfigureProcesses,
  onConfigureProcess,
  onError,
}: {
  chains: ProcessingChainRecord[];
  types: CatalogProcessType[];
  preferredUnit?: string | null;
  canStartRun: boolean;
  canConfigureProcesses?: boolean;
  onConfigureProcess?: (processTypeId: string) => void;
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
          canConfigureProcesses={canConfigureProcesses}
          onConfigureProcess={onConfigureProcess}
          onError={onError}
        />
      )}
    </div>
  );
}
