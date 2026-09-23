'use client';

import { DndContext, type DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import { AuthApp } from './auth-app';
import { useSession } from '../lib/session';

type ProcessType = { id: string; name: string; default_unit?: string; default_destination_godown_id?: string | null };
type Lot = { id: string; code: string; item_id: string; item_name: string; qty_kg: number; godown_id?: string | null; godown_name?: string | null };
type Item = { id: string; name: string; display_unit?: string; unit?: string };
type TemplateLine = { id: string; line_type: 'INPUT' | 'OUTPUT' | 'LOSS'; semantic_type?: string; item_id: string; item_name: string; default_unit?: string; default_godown_id?: string | null; auto_calculate?: boolean; required?: boolean };
type Godown = { id: string; name: string };
type Workspace = { process_type: ProcessType; lots: Lot[]; items: Item[]; godowns: Godown[]; template_lines: TemplateLine[] };
type Input = Lot & { quantity: string; unit: string };
type Output = { templateLineId?: string; lineType: 'OUTPUT' | 'LOSS'; semanticType: string; itemId: string; itemName: string; quantity: string; unit: string; godownId: string; autoCalculate: boolean; required: boolean };
type ProcessingChain = { id: string; name: string; steps: { id: string; step_number: number; process_type_name?: string }[] };
type ProcessRun = { id: string; run_date?: string; process_type_name?: string; status?: string; lines?: { line_type?: string; item_name?: string; quantity_base?: number }[] };

const asKg = (value: string, unit: string) => Number(value || 0) * ({ KG: 1, QUINTAL: 100, TONNE: 1000 }[unit] ?? 0);
const units = ['KG', 'QUINTAL', 'TONNE'];

function DraggableLot({ lot, selected }: { lot: Lot; selected: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: lot.id, disabled: selected });
  return <button ref={setNodeRef} {...listeners} {...attributes} className={`process-material${selected ? ' used' : ''}`} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }} disabled={selected}>
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
  const [chains, setChains] = useState<ProcessingChain[]>([]);
  const [selectedChainId, setSelectedChainId] = useState('');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [inputs, setInputs] = useState<Input[]>([]);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [destinationGodownId, setDestinationGodownId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [runs, setRuns] = useState<ProcessRun[]>([]);

  useEffect(() => {
    if (!session) return;
    void fetch('/api/process-types?include_archived=1', { credentials: 'include' }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load process types');
      const active = (body.process_types as ProcessType[]).filter((type) => !(type as ProcessType & { deleted_at?: string }).deleted_at);
      setTypes(active); setSelectedTypeId(active[0]?.id ?? '');
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load Processing'));
  }, [session]);

  const loadRuns = async () => {
    const response = await fetch('/api/process-runs', { credentials: 'include' });
    const body = await response.json() as { runs?: ProcessRun[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Could not load process runs');
    setRuns(body.runs ?? []);
  };
  useEffect(() => { if (session) void loadRuns().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load process runs')); }, [session]);

  useEffect(() => {
    if (!session) return;
    void fetch('/api/processing-chains', { credentials: 'include' }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load processing chains');
      const available = body.chains as ProcessingChain[];
      setChains(available); setSelectedChainId((current) => current || available[0]?.id || '');
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load processing chains'));
  }, [session]);

  useEffect(() => {
    if (!selectedTypeId) return;
    setError(null); setWorkspace(null); setInputs([]);
    void fetch(`/api/process-workspace?process_type_id=${encodeURIComponent(selectedTypeId)}`, { credentials: 'include' }).then(async (response) => {
      const body = await response.json() as Workspace & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Could not load process workspace');
      setWorkspace(body);
      setDestinationGodownId(body.process_type.default_destination_godown_id ?? '');
      setOutputs(body.template_lines.filter((line): line is TemplateLine & { line_type: 'OUTPUT' | 'LOSS' } => line.line_type !== 'INPUT').map((line) => ({
        templateLineId: line.id, lineType: line.line_type, semanticType: line.semantic_type ?? (line.line_type === 'LOSS' ? 'waste' : 'main'), itemId: line.item_id, itemName: line.item_name,
        quantity: '', unit: line.default_unit ?? body.process_type.default_unit ?? 'QUINTAL', godownId: line.default_godown_id ?? body.process_type.default_destination_godown_id ?? '', autoCalculate: Boolean(line.auto_calculate), required: Boolean(line.required),
      })));
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load workspace'));
  }, [selectedTypeId]);

  const balance = useMemo(() => {
    const inputKg = inputs.reduce((sum, input) => sum + asKg(input.quantity, input.unit), 0);
    const outputKg = outputs.reduce((sum, output) => sum + asKg(output.quantity, output.unit), 0);
    return { inputKg, outputKg, differenceKg: inputKg - outputKg };
  }, [inputs, outputs]);

  function addLot(lotId: string) {
    const lot = workspace?.lots.find((candidate) => candidate.id === lotId);
    if (!lot || inputs.some((input) => input.id === lot.id)) return;
    const unit = workspace?.process_type.default_unit ?? 'QUINTAL';
    setInputs((current) => [...current, { ...lot, quantity: '', unit }]);
  }
  function onDragEnd(event: DragEndEvent) { if (event.over?.id === 'process-inputs') addLot(String(event.active.id)); }
  function updateOutput(index: number, quantity: string) { setOutputs((current) => current.map((output, i) => i === index ? { ...output, quantity } : output)); }
  async function postRun() {
    if (!workspace || !inputs.length || balance.differenceKg < -0.001) return;
    if (outputs.some((output) => output.required && Number(output.quantity) <= 0)) { setError('Enter an actual quantity for every required output.'); return; }
    setPosting(true); setError(null);
    const lines = [
      ...inputs.filter((input) => Number(input.quantity) > 0).map((input) => ({ line_type: 'INPUT', semantic_type: 'input', item_id: input.item_id, lot_id: input.id, quantity: input.quantity, unit: input.unit })),
      ...outputs.filter((output) => Number(output.quantity) > 0).map((output) => ({ line_type: output.lineType, semantic_type: output.semanticType, template_line_id: output.templateLineId ?? null, item_id: output.itemId, godown_id: output.godownId || destinationGodownId || null, quantity: output.quantity, unit: output.unit })),
    ];
    try {
      const response = await fetch('/api/process-runs', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ process_type_id: workspace.process_type.id, destination_godown_id: destinationGodownId || null, lines }) });
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

  const selectedChain = chains.find((chain) => chain.id === selectedChainId);
  const canvasSteps = selectedChain?.steps ?? [];
  const nodes: Node[] = canvasSteps.map((step, index) => ({ id: step.id, position: { x: index * 220 + 40, y: 95 }, data: { label: `${step.step_number}. ${step.process_type_name ?? 'Process step'}` }, type: 'default' }));
  const edges: Edge[] = canvasSteps.slice(1).map((step, index) => ({ id: `edge-${step.id}`, source: canvasSteps[index].id, target: step.id, animated: true }));
  if (session === undefined) return <main className="auth-page"><p className="muted">Checking your MillSaathi session…</p></main>;
  if (!session) return <><AuthApp onSuccess={setSession} />{sessionError && <p className="error">{sessionError}</p>}</>;
  const today = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());
  return <main className="shell"><AppHeader session={session} /><section className="workspace">
    <div className="toolbar processing-topbar"><div><h2>Processing</h2><p className="muted">Transform inputs into traceable outputs</p></div><div className="processing-tabs"><button type="button">Chain view</button><button className="selected" type="button">Run log</button></div><div className="processing-date"><strong>{today}</strong><small>Kharif season</small></div></div><div className="process-stepper" aria-label="Process type">{types.map((type) => <button type="button" key={type.id} className={type.id === selectedTypeId ? 'on' : ''} onClick={() => setSelectedTypeId(type.id)}>{type.name}</button>)}<button className="process-edit" type="button">Edit processes</button></div>
    {error && <p className="error" role="alert">{error}</p>}
    {!workspace && !error && <p className="muted">Loading processing workspace…</p>}
    {workspace && <DndContext onDragEnd={onDragEnd}><div className="process-flow">
      <section className="process-column"><h2 className="process-column-title">Available materials <span>{workspace.lots.length}</span></h2><div className="process-materials">{workspace.lots.length ? workspace.lots.map((lot) => <DraggableLot key={lot.id} lot={lot} selected={inputs.some((input) => input.id === lot.id)} />) : <p className="muted">No available lots.</p>}</div></section>
      <section className="process-column process-center"><h2 className="process-column-title">Process</h2><ProcessDropzone>{inputs.length ? <div className="process-selected">{inputs.map((input) => <div className="process-selected-line" key={input.id}><span>{input.item_name} · {input.code}</span><label><input aria-label={`Quantity for ${input.item_name}`} type="number" min="0" step="0.001" value={input.quantity} onChange={(event) => setInputs((current) => current.map((candidate) => candidate.id === input.id ? { ...candidate, quantity: event.target.value } : candidate))} /> {input.unit.toLowerCase()}</label></div>)}</div> : <><strong className="process-drop-title">{workspace.process_type.name}</strong><p>Drop a lot here or use a material card</p><p>No input lot selected.</p></>}</ProcessDropzone>{inputs.length > 0 && <button className="secondary" type="button" onClick={() => setInputs([])}>Clear inputs</button>}</section>
      <section className="process-column"><h2 className="process-column-title">Outputs</h2><div className="process-outputs">{outputs.length ? outputs.map((output, index) => <div className="process-output-card" key={output.templateLineId ?? `${output.itemId}-${index}`}><strong>{output.itemName}</strong><span>{output.semanticType}</span><div className="process-output-input"><input aria-label={`Quantity for ${output.itemName}`} type="number" min="0" step="0.001" readOnly={output.autoCalculate} value={output.quantity} onChange={(event) => updateOutput(index, event.target.value)} /><span>{output.unit.toLowerCase()}</span></div></div>) : <p className="process-output-empty">Configure outputs or add one<br/>manually.</p>}</div><button className="process-add-output" type="button">+ Add output</button><label className="process-godown-label">Destination godown <select value={destinationGodownId} onChange={(event) => setDestinationGodownId(event.target.value)}><option value="">Choose godown</option>{workspace.godowns.map((godown) => <option key={godown.id} value={godown.id}>{godown.name}</option>)}</select></label></section>
    </div></DndContext>}
    {workspace && <div className={`balance${balance.differenceKg < 0 ? ' warn' : ''}`}>Input: <strong>{(balance.inputKg / 100).toFixed(3)} qtl</strong> · Accounted: <strong>{(balance.outputKg / 100).toFixed(3)} qtl</strong> · {balance.differenceKg >= 0 ? 'Implied wastage' : 'Over by'}: <strong>{(Math.abs(balance.differenceKg) / 100).toFixed(3)} qtl</strong><button type="button" className="post" style={{ float: 'right' }} disabled={posting || !inputs.length || balance.differenceKg < 0} onClick={() => void postRun()}>{posting ? 'Posting…' : 'Post run'}</button></div>}
    <section className="panel" style={{ marginTop: 16 }}><h2>Recent process runs</h2>{runs.length ? runs.slice(0, 8).map(run => <div className="line" key={run.id}><span>{run.run_date ?? '—'} · {run.process_type_name ?? 'Process run'} · {(run.lines ?? []).filter(line => line.line_type === 'INPUT').map(line => `${line.item_name ?? 'Input'} ${((line.quantity_base ?? 0) / 100).toFixed(2)} qtl`).join(', ')}</span><span className="inline-actions"><strong className="status">{run.status ?? '—'}</strong>{run.status === 'POSTED' && <button onClick={() => void voidRun(run)}>Void</button>}</span></div>) : <p className="muted">No process runs posted yet.</p>}</section>
    {chains.length > 0 && <><div className="chain-heading"><h2 className="chain-title">Processing-chain canvas</h2><select value={selectedChainId} onChange={(event) => setSelectedChainId(event.target.value)} aria-label="Processing chain">{chains.map((chain) => <option key={chain.id} value={chain.id}>{chain.name}</option>)}</select></div><div className="chain"><ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable><Background /><MiniMap /><Controls /></ReactFlow></div></>}
  </section></main>;
}
