'use client';

import { DndContext, type DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import { AuthApp } from './auth-app';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  FormActions,
  Input,
  Select,
  TableCard,
} from './ui';
import { TableEditCell, TableEditModeButton } from './table-edit-mode';
import { can } from '../lib/permissions';
import { useTableEditMode, withEditModeColumns } from '../lib/table-edit-mode';
import { useSession } from '../lib/session';
import { CatalogProcessType, ProcessCatalog } from './process-catalog';
import { ProcessChainStudio } from './process-chain-studio';

const RUN_COLUMNS_BASE = [
  { id: 'date', label: 'Date' },
  { id: 'process', label: 'Process' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'status', label: 'Status' },
];

type ProcessType = CatalogProcessType;
type Lot = { id: string; code: string; item_id: string; item_name: string; qty_kg: number; godown_id?: string | null; godown_name?: string | null };
type Item = { id: string; name: string; display_unit?: string; unit?: string };
type TemplateLine = { id: string; line_type: 'INPUT' | 'OUTPUT' | 'LOSS'; semantic_type?: string; item_id: string; item_name: string; default_unit?: string; default_godown_id?: string | null; auto_calculate?: boolean; required?: boolean };
type Godown = { id: string; name: string };
type Workspace = { process_type: ProcessType; lots: Lot[]; items: Item[]; godowns: Godown[]; template_lines: TemplateLine[] };
type Input = Lot & { quantity: string; unit: string };
type Output = { templateLineId?: string; lineType: 'OUTPUT' | 'LOSS'; semanticType: string; itemId: string; itemName: string; quantity: string; unit: string; godownId: string; autoCalculate: boolean; required: boolean };
type ProcessRun = { id: string; run_date?: string; process_type_name?: string; status?: string; lines?: { line_type?: string; item_name?: string; quantity_base?: number }[] };
type ProcessingView = 'chain' | 'runs';
type ProcessingChain = { id: string; name: string; description?: string | null; steps: { id: string; process_type_id: string; step_number: number; process_type_name?: string; process_type_description?: string | null; notes?: string | null }[] };

/** Terminal steps (or standalone types) assign stock to a godown; mid-chain outputs stay in-process. */
function assignsDestinationGodown(typeId: string, chains: ProcessingChain[]) {
  const relevant = chains.filter((chain) => chain.steps.some((step) => step.process_type_id === typeId));
  if (!relevant.length) return true;
  return relevant.every((chain) => {
    const lastStep = chain.steps.reduce((best, step) => (step.step_number > best.step_number ? step : best), chain.steps[0]);
    return lastStep.process_type_id === typeId;
  });
}

const UNIT_BASE_KG: Record<string, number> = { KG: 1, QUINTAL: 100, TONNE: 1000 };
const units = ['KG', 'QUINTAL', 'TONNE'];

const asKg = (value: string, unit: string) => Number(value || 0) * (UNIT_BASE_KG[unit] ?? 0);

function maxQuantityForLot(lot: Lot, unit: string) {
  const base = UNIT_BASE_KG[unit];
  if (!base) return null;
  return lot.qty_kg / base;
}

function formatQuantity(value: number, maxFractionDigits = 3) {
  return value.toLocaleString('en-IN', { maximumFractionDigits: maxFractionDigits });
}

function DraggableLot({ lot, selected }: { lot: Lot; selected: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lot.id, disabled: selected });
  return <button ref={setNodeRef} {...listeners} {...attributes} className={`process-material ms-draggable${selected ? ' used' : ''}${isDragging ? ' ms-dragging' : ''}`} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }} disabled={selected}>
    <span className="process-material-head"><span><strong>{lot.item_name}</strong><small>{lot.code}</small></span><b>{selected ? 'Added' : 'Use'}</b></span><span className="process-material-qty">{(lot.qty_kg / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} quintal available</span><small>{lot.godown_name ?? 'No godown'}</small>
  </button>;
}

function ProcessDropzone({ children }: Readonly<{ children: React.ReactNode }>) {
  const { isOver, setNodeRef } = useDroppable({ id: 'process-inputs' });
  return <div ref={setNodeRef} className={`process-dropzone${isOver ? ' drag-over' : ''}`}>{children}</div>;
}

export function ProcessingApp() {
  const { session, setSession, sessionError } = useSession();
  const [types, setTypes] = useState<ProcessType[]>([]);
  const [view, setView] = useState<ProcessingView>('chain');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [inputs, setInputs] = useState<Input[]>([]);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [destinationGodownId, setDestinationGodownId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [runs, setRuns] = useState<ProcessRun[]>([]);
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [editorTypeId, setEditorTypeId] = useState<string | null>(null);
  const tableEdit = useTableEditMode();
  const canVoidRun = can(session, 'processing:void');
  const [catalogTypes, setCatalogTypes] = useState<CatalogProcessType[]>([]);
  const [outputFormOpen, setOutputFormOpen] = useState(false);
  const [outputDraft, setOutputDraft] = useState({ itemId: '', semanticType: 'main', quantity: '' });
  const [chains, setChains] = useState<ProcessingChain[]>([]);
  const [outputFormError, setOutputFormError] = useState<string | null>(null);

  const canManageOrg = can(session, 'processing:configure');

  const loadTypes = async () => {
    const response = await fetch('/api/process-types?include_archived=1', { credentials: 'include' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'Could not load process types');
    const allTypes = body.process_types as CatalogProcessType[];
    const active = allTypes.filter((type) => !type.deleted_at);
    setCatalogTypes(allTypes);
    setTypes(active);
    setSelectedTypeId((current) => (active.some((type) => type.id === current) ? current : active[0]?.id ?? ''));
  };

  useEffect(() => {
    if (!session) return;
    void loadTypes().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load Processing'));
  }, [session]);

  const loadRuns = async () => {
    const response = await fetch('/api/process-runs', { credentials: 'include' });
    const body = await response.json() as { runs?: ProcessRun[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Could not load process runs');
    setRuns(body.runs ?? []);
  };
  useEffect(() => { if (session) void loadRuns().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load process runs')); }, [session]);

  const loadChains = useCallback(async () => {
    const response = await fetch('/api/processing-chains', { credentials: 'include' });
    const body = await response.json() as { chains?: ProcessingChain[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Could not load processing chains');
    setChains(body.chains ?? []);
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadChains().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load processing chains'));
  }, [session, loadChains]);

  const loadWorkspace = useCallback(async (typeId: string) => {
    if (!typeId) return;
    setError(null);
    setWorkspace(null);
    setInputs([]);
    setOutputFormOpen(false);
    setOutputFormError(null);
    setOutputDraft({ itemId: '', semanticType: 'main', quantity: '' });
    const response = await fetch(`/api/process-workspace?process_type_id=${encodeURIComponent(typeId)}`, { credentials: 'include' });
    const body = await response.json() as Workspace & { error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Could not load process workspace');
    setWorkspace(body);
    setDestinationGodownId(body.process_type.default_destination_godown_id ?? '');
    setOutputs(body.template_lines.filter((line): line is TemplateLine & { line_type: 'OUTPUT' | 'LOSS' } => line.line_type !== 'INPUT').map((line) => ({
      templateLineId: line.id, lineType: line.line_type, semanticType: line.semantic_type ?? (line.line_type === 'LOSS' ? 'waste' : 'main'), itemId: line.item_id, itemName: line.item_name,
      quantity: '', unit: line.default_unit ?? body.process_type.default_unit ?? 'QUINTAL', godownId: line.default_godown_id ?? body.process_type.default_destination_godown_id ?? '', autoCalculate: Boolean(line.auto_calculate), required: Boolean(line.required),
    })));
  }, []);

  useEffect(() => {
    if (!selectedTypeId) return;
    void loadWorkspace(selectedTypeId).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load workspace'));
  }, [selectedTypeId, loadWorkspace]);

  const inheritedUnit = inputs[0]?.unit ?? workspace?.process_type.default_unit ?? 'QUINTAL';
  const showDestinationGodown = assignsDestinationGodown(selectedTypeId, chains);

  const balance = useMemo(() => {
    const inputKg = inputs.reduce((sum, input) => sum + asKg(input.quantity, input.unit), 0);
    const outputKg = outputs.reduce((sum, output) => sum + asKg(output.quantity, output.unit), 0);
    return { inputKg, outputKg, differenceKg: inputKg - outputKg };
  }, [inputs, outputs]);

  const inputErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const input of inputs) {
      const max = maxQuantityForLot(input, input.unit);
      const quantity = Number(input.quantity);
      if (input.quantity && max != null && Number.isFinite(quantity) && quantity > max) {
        errors[input.id] = `Should be lower than ${formatQuantity(max)} ${input.unit.toLowerCase()}`;
      }
    }
    return errors;
  }, [inputs]);

  const hasInputErrors = Object.keys(inputErrors).length > 0;

  useEffect(() => {
    const unit = inputs[0]?.unit;
    if (!unit) return;
    setOutputs((current) => current.map((output) => (output.unit === unit ? output : { ...output, unit })));
  }, [inputs[0]?.unit]);

  function addLot(lotId: string) {
    const lot = workspace?.lots.find((candidate) => candidate.id === lotId);
    if (!lot || inputs.some((input) => input.id === lot.id)) return;
    const unit = workspace?.process_type.default_unit ?? 'QUINTAL';
    setInputs((current) => [...current, { ...lot, quantity: '', unit }]);
  }
  function onDragEnd(event: DragEndEvent) { if (event.over?.id === 'process-inputs') addLot(String(event.active.id)); }
  function updateInputQuantity(inputId: string, quantity: string) {
    setInputs((current) => current.map((input) => input.id === inputId ? { ...input, quantity } : input));
  }
  function updateOutput(index: number, quantity: string) { setOutputs((current) => current.map((output, i) => i === index ? { ...output, quantity } : output)); }
  function removeOutput(index: number) {
    setOutputs((current) => current.filter((_, i) => i !== index));
  }
  function openAddOutput() {
    setOutputFormError(null);
    if (!workspace) return;
    if (!workspace.items.length) {
      setOutputFormError('No items are configured yet. Add items before creating a manual output.');
      setOutputFormOpen(true);
      return;
    }
    if (!inputs.length) {
      setOutputFormError('Add an input lot before adding a manual output.');
      setOutputFormOpen(true);
      return;
    }
    setOutputFormOpen(true);
  }
  function submitManualOutput() {
    if (!workspace) return;
    setOutputFormError(null);
    const item = workspace.items.find((candidate) => candidate.id === outputDraft.itemId);
    if (!item) {
      setOutputFormError('Choose an item for this output.');
      return;
    }
    const quantity = Number(outputDraft.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setOutputFormError('Enter a positive quantity.');
      return;
    }
    const proposedKg = asKg(outputDraft.quantity, inheritedUnit);
    const remainingKg = balance.differenceKg;
    if (proposedKg > remainingKg + 0.001) {
      setOutputFormError(`This output exceeds the remaining input quantity (${formatQuantity(remainingKg / 100)} qtl). Reduce it or adjust an existing output.`);
      return;
    }
    setOutputs((current) => [...current, {
      lineType: outputDraft.semanticType === 'waste' ? 'LOSS' : 'OUTPUT',
      semanticType: outputDraft.semanticType,
      itemId: item.id,
      itemName: item.name,
      quantity: outputDraft.quantity,
      unit: inheritedUnit,
      godownId: showDestinationGodown ? destinationGodownId : '',
      autoCalculate: false,
      required: true,
    }]);
    setOutputDraft({ itemId: '', semanticType: 'main', quantity: '' });
    setOutputFormOpen(false);
  }
  async function postRun() {
    if (!workspace || !inputs.length || balance.differenceKg < -0.001 || hasInputErrors) return;
    if (inputs.some((input) => Number(input.quantity) <= 0)) { setError('Enter a positive quantity for every selected input lot.'); return; }
    if (outputs.some((output) => output.required && Number(output.quantity) <= 0)) { setError('Enter an actual quantity for every required output.'); return; }
    setPosting(true); setError(null);
    const lines = [
      ...inputs.filter((input) => Number(input.quantity) > 0).map((input) => ({ line_type: 'INPUT', semantic_type: 'input', item_id: input.item_id, lot_id: input.id, quantity: input.quantity, unit: input.unit })),
      ...outputs.filter((output) => Number(output.quantity) > 0).map((output) => ({
        line_type: output.lineType,
        semantic_type: output.semanticType,
        template_line_id: output.templateLineId ?? null,
        item_id: output.itemId,
        godown_id: showDestinationGodown ? (output.godownId || destinationGodownId || null) : null,
        quantity: output.quantity,
        unit: output.unit,
      })),
    ];
    try {
      const response = await fetch('/api/process-runs', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        process_type_id: workspace.process_type.id,
        destination_godown_id: showDestinationGodown ? (destinationGodownId || null) : null,
        lines,
      }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Could not post process run');
      setInputs([]); setOutputs((current) => current.map((output) => ({ ...output, quantity: '' })));
      await loadRuns();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not post process run'); } finally { setPosting(false); }
  }
  async function voidRun(run: ProcessRun) {
    if (!window.confirm(`Void ${run.process_type_name ?? 'this process run'}? Its stock movements will be reversed.`)) return;
    try { setError(null); const response = await fetch(`/api/process-runs/${run.id}/void`, { method: 'POST', credentials: 'include' }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Could not void process run'); await loadRuns(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not void process run'); }
  }

  if (session === undefined) return <main className="auth-page"><p className="muted">Checking your MillSaathi session…</p></main>;
  if (!session) return <><AuthApp onSuccess={setSession} />{sessionError && <p className="error">{sessionError}</p>}</>;
  const today = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());
  return <main className="shell"><AppHeader session={session} /><section className="workspace">
    <div className="toolbar processing-topbar"><div><h2>Processing</h2><p className="muted">Transform inputs into traceable outputs</p></div><div className="processing-tabs"><button type="button" className={view === 'chain' ? 'selected' : ''} onClick={() => setView('chain')}>Chain view</button><button type="button" className={view === 'runs' ? 'selected' : ''} onClick={() => setView('runs')}>Manual view</button></div><div className="processing-date"><strong>{today}</strong><small>Kharif season</small></div></div>
    {view === 'runs' && (
      <div className="process-toolbar">
        <div className="process-toolbar-actions">
          <div className={`process-stepper${stepsExpanded ? ' expanded' : ''}`} aria-label="Process type">
            {types.map((type, index) => (
              <Fragment key={type.id}>
                {index > 0 && <span className="process-step-arrow" aria-hidden="true">→</span>}
                <button type="button" className={type.id === selectedTypeId ? 'on' : ''} onClick={() => setSelectedTypeId(type.id)}>{type.name}</button>
              </Fragment>
            ))}
          </div>
          <Select className="process-select" value={selectedTypeId} onChange={(event) => setSelectedTypeId(event.target.value)} aria-label="Choose process">
            {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </Select>
          {types.length > 1 && (
            <button
              type="button"
              className="process-step-expand"
              aria-label={stepsExpanded ? 'Show compact process list' : 'Show all process steps'}
              onClick={() => setStepsExpanded((current) => !current)}
            >
              {stepsExpanded ? '⌃' : '⌄'}
            </button>
          )}
          {canManageOrg && selectedTypeId ? (
            <Button
              type="button"
              className="secondary process-catalog-toggle"
              onClick={() => setEditorTypeId(selectedTypeId)}
            >
              Edit process
            </Button>
          ) : null}
          {canManageOrg ? (
            <Button
              type="button"
              className="quiet"
              onClick={() => setCatalogOpen(true)}
            >
              All processes
            </Button>
          ) : null}
        </div>
      </div>
    )}
    {canManageOrg && (
      <ProcessCatalog
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        editorTypeId={editorTypeId}
        onEditorTypeIdChange={setEditorTypeId}
        types={catalogTypes}
        preferredUnit={session.preferred_unit ?? 'QUINTAL'}
        onChanged={async () => {
          await loadTypes();
          if (selectedTypeId) await loadWorkspace(selectedTypeId);
        }}
      />
    )}
    {error && <Alert title="Processing error" level="red">{error}</Alert>}
    {view === 'chain' && (
      <ProcessChainStudio
        chains={chains}
        types={catalogTypes}
        canManage={canManageOrg}
        onChainsChange={loadChains}
        onError={setError}
      />
    )}
    {view === 'runs' && <>
      {!workspace && !error && <p className="muted">Loading processing workspace…</p>}
      {workspace && <DndContext onDragEnd={onDragEnd}><div className="process-flow">
        <section className="process-column process-column--materials"><h2 className="process-column-title">Available materials <span>{workspace.lots.length}</span></h2><div className="process-materials">{workspace.lots.length ? workspace.lots.map((lot) => <DraggableLot key={lot.id} lot={lot} selected={inputs.some((input) => input.id === lot.id)} />) : <p className="muted">No available lots.</p>}</div></section>
        <section className="process-column process-center process-column--center">
          <h2 className="process-column-title">Process</h2>
          <ProcessDropzone>
            {inputs.length ? (
              <div className="process-selected">
                {inputs.map((input) => {
                  const maxQuantity = maxQuantityForLot(input, input.unit);
                  return (
                    <div className="process-selected-line" key={input.id}>
                      <span>{input.item_name} · {input.code}</span>
                      <label>
                        <input
                          aria-label={`Quantity for ${input.item_name}`}
                          type="number"
                          min="0"
                          max={maxQuantity ?? undefined}
                          step="0.001"
                          className={inputErrors[input.id] ? 'process-input-over' : undefined}
                          value={input.quantity}
                          onChange={(event) => updateInputQuantity(input.id, event.target.value)}
                        />
                        {input.unit.toLowerCase()}
                      </label>
                      {inputErrors[input.id] && <span className="process-field-error">{inputErrors[input.id]}</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                <strong className="process-drop-title">{workspace.process_type.name}</strong>
                <p>Drop a lot here or use a material card</p>
                <p>No input lot selected.</p>
              </>
            )}
          </ProcessDropzone>
          {inputs.length > 0 && <Button className="secondary" type="button" onClick={() => setInputs([])}>Clear inputs</Button>}
        </section>
        <section className="process-column">
          <h2 className="process-column-title">Outputs</h2>
          <div className="process-outputs">
            {outputs.length ? outputs.map((output, index) => (
              <div className="process-output-card" key={output.templateLineId ?? `manual-${output.itemId}-${index}`}>
                <div className="process-output-card-head">
                  <div>
                    <strong>{output.itemName}</strong>
                    <span>{output.semanticType}</span>
                  </div>
                  {!output.templateLineId && (
                    <Button type="button" className="secondary" onClick={() => removeOutput(index)}>Remove</Button>
                  )}
                </div>
                <div className="process-output-input">
                  <input
                    aria-label={`Quantity for ${output.itemName}`}
                    type="number"
                    min="0"
                    step="0.001"
                    readOnly={output.autoCalculate}
                    value={output.quantity}
                    onChange={(event) => updateOutput(index, event.target.value)}
                  />
                  <span>{output.unit.toLowerCase()}</span>
                </div>
              </div>
            )) : (
              <p className="process-output-empty">Configure outputs or add one<br />manually.</p>
            )}
          </div>
          <button className="process-add-output" type="button" onClick={openAddOutput}>+ Add output</button>
          {outputFormOpen && (
            <div className="process-output-form">
              {outputFormError && <p className="process-field-error process-output-form-error">{outputFormError}</p>}
              <Field label="Item">
                <Select value={outputDraft.itemId} onChange={(event) => setOutputDraft((current) => ({ ...current, itemId: event.target.value }))} aria-label="Output item">
                  <option value="">Choose item</option>
                  {workspace.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              </Field>
              <Field label="Output type">
                <Select value={outputDraft.semanticType} onChange={(event) => setOutputDraft((current) => ({ ...current, semanticType: event.target.value }))} aria-label="Output type">
                  <option value="main">Main output</option>
                  <option value="byproduct">By-product</option>
                  <option value="waste">Waste / loss</option>
                </Select>
              </Field>
              <Field label={`Quantity (${inheritedUnit.toLowerCase()})`}>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={outputDraft.quantity}
                  onChange={(event) => setOutputDraft((current) => ({ ...current, quantity: event.target.value }))}
                  aria-label="Output quantity"
                />
              </Field>
              <FormActions>
                <Button type="button" className="secondary" onClick={() => { setOutputFormOpen(false); setOutputFormError(null); }}>Cancel</Button>
                <Button type="button" onClick={submitManualOutput}>Add output</Button>
              </FormActions>
            </div>
          )}
          {showDestinationGodown ? (
            <label className="process-godown-label">
              Destination godown
              <Select value={destinationGodownId} onChange={(event) => setDestinationGodownId(event.target.value)} aria-label="Destination godown">
                <option value="">Choose godown</option>
                {workspace.godowns.map((godown) => <option key={godown.id} value={godown.id}>{godown.name}</option>)}
              </Select>
            </label>
          ) : (
            <p className="muted process-godown-hint">Output stays in-process until the final chain step assigns a godown.</p>
          )}
        </section>
      </div></DndContext>}
      {workspace && <div className={`balance${balance.differenceKg < 0 || hasInputErrors ? ' warn' : ''}`}>Input: <strong>{(balance.inputKg / 100).toFixed(3)} qtl</strong> · Accounted: <strong>{(balance.outputKg / 100).toFixed(3)} qtl</strong> · {balance.differenceKg >= 0 ? 'Implied wastage' : 'Over by'}: <strong>{(Math.abs(balance.differenceKg) / 100).toFixed(3)} qtl</strong>{hasInputErrors && <span className="process-field-error" style={{ marginLeft: 12 }}>Fix input quantities above the available lot amount.</span>}<Button type="button" style={{ float: 'right' }} disabled={posting || !inputs.length || balance.differenceKg < 0 || hasInputErrors} onClick={() => void postRun()}>{posting ? 'Posting…' : 'Post run'}</Button></div>}
      <div style={{ marginTop: 16 }}>
        <TableCard
          title="Recent process runs"
          subtitle={`${runs.length} run${runs.length === 1 ? '' : 's'}`}
          actions={
            <TableEditModeButton
              enabled={canVoidRun}
              editMode={tableEdit.editMode}
              onToggle={tableEdit.toggleEditMode}
            />
          }
        >
          <DataTable columns={withEditModeColumns(RUN_COLUMNS_BASE, tableEdit.editMode, { canEdit: canVoidRun })}>
            {runs.length ? runs.slice(0, 8).map((run) => (
              <tr key={run.id}>
                {tableEdit.editMode && canVoidRun && (
                  run.status === 'POSTED'
                    ? <TableEditCell label={run.process_type_name ?? 'process run'} onClick={() => void voidRun(run)} />
                    : <td className="table-edit-col" />
                )}
                <td>{run.run_date ?? '—'}</td>
                <td><strong>{run.process_type_name ?? 'Process run'}</strong></td>
                <td>{(run.lines ?? []).filter((line) => line.line_type === 'INPUT').map((line) => `${line.item_name ?? 'Input'} ${((line.quantity_base ?? 0) / 100).toFixed(2)} qtl`).join(', ') || '—'}</td>
                <td><Badge tone={run.status === 'POSTED' ? 'success' : 'neutral'}>{run.status ?? '—'}</Badge></td>
              </tr>
            )) : (
              <tr>
                <td colSpan={withEditModeColumns(RUN_COLUMNS_BASE, tableEdit.editMode, { canEdit: canVoidRun }).length}><EmptyState>No process runs posted yet.</EmptyState></td>
              </tr>
            )}
          </DataTable>
        </TableCard>
      </div>
    </>}
  </section></main>;
}
