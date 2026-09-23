'use client';

import {
  Background,
  BackgroundVariant,
  Connection,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogProcessType } from './process-catalog';
import { StudioFlowEdge } from './process-studio-edge';
import { Button, Canvas, Field, IconButton, Input, Select } from './ui';
import {
  STUDIO_GRID,
  buildLibrary,
  cloneLayout,
  createNodeFromBlock,
  isCellOccupied,
  layoutFromChain,
  materialFlowForType,
  normalizeLayout,
  readStoredLayout,
  snapPosition,
  stepsFromLayout,
  writeStoredLayout,
  type ProcessingChainRecord,
  type StudioLayout,
  type StudioLibraryBlock,
  type StudioNodeData,
} from '../lib/process-studio';

const DRAG_TYPE = 'application/millsaathi-process-block';

const defaultEdgeOptions = {
  type: 'studio' as const,
  markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--edge-color)' },
  style: { stroke: 'var(--edge-color)', strokeWidth: 2 },
};

const edgeTypes = { studio: StudioFlowEdge };

/** One connectable dot per side — loose mode allows any side to any side (e.g. top → top). */
function StudioHandles() {
  return (
    <>
      <Handle className="process-studio-handle" type="source" position={Position.Left} id="left" />
      <Handle className="process-studio-handle" type="source" position={Position.Right} id="right" />
      <Handle className="process-studio-handle" type="source" position={Position.Top} id="top" />
      <Handle className="process-studio-handle" type="source" position={Position.Bottom} id="bottom" />
    </>
  );
}

function ProcessStudioNode({ data, selected }: NodeProps<Node<StudioNodeData>>) {
  return (
    <div className={`process-studio-node process-studio-node--process${selected ? ' selected' : ''}`}>
      <StudioHandles />
      <strong>{data.name}</strong>
      {data.description && <small>{data.description}</small>}
    </div>
  );
}

function StorageStudioNode({ data, selected }: NodeProps<Node<StudioNodeData>>) {
  return (
    <div className={`process-studio-node process-studio-node--storage${selected ? ' selected' : ''}`}>
      <StudioHandles />
      <span className="process-studio-badge">Storage</span>
      <strong>{data.name}</strong>
      {data.description && <small>{data.description}</small>}
    </div>
  );
}

function GateStudioNode({ data, selected }: NodeProps<Node<StudioNodeData>>) {
  return (
    <div className={`process-studio-node process-studio-node--gate${selected ? ' selected' : ''}`}>
      <StudioHandles />
      <span className="process-studio-badge">Gate</span>
      <strong>{data.name}</strong>
      {data.description && <small>{data.description}</small>}
    </div>
  );
}

function CustomStudioNode({ data, selected }: NodeProps<Node<StudioNodeData>>) {
  return (
    <div className={`process-studio-node process-studio-node--custom${selected ? ' selected' : ''}`}>
      <StudioHandles />
      <strong>{data.name}</strong>
      {data.description && <small>{data.description}</small>}
    </div>
  );
}

const nodeTypes = {
  process: ProcessStudioNode,
  storage: StorageStudioNode,
  gate: GateStudioNode,
  custom: CustomStudioNode,
};

function LibraryItem({ block }: { block: StudioLibraryBlock }) {
  function onDragStart(event: React.DragEvent<HTMLButtonElement>) {
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(block));
    event.dataTransfer.effectAllowed = 'move';
  }

  return (
    <button
      type="button"
      className={`process-studio-library-item process-studio-library-item--${block.kind}`}
      draggable
      onDragStart={onDragStart}
    >
      <span className="process-studio-library-icon" aria-hidden="true" />
      <span className="process-studio-library-copy">
        <strong>{block.name}</strong>
        <small>{block.description}</small>
      </span>
    </button>
  );
}

function StudioCanvas({
  chain,
  types,
  canManage,
  onChainsChange,
  onError,
}: {
  chain: ProcessingChainRecord;
  types: CatalogProcessType[];
  canManage: boolean;
  onChainsChange: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const reactFlow = useReactFlow<Node<StudioNodeData>, Edge>();
  const studioRef = useRef<HTMLDivElement>(null);
  const undoStackRef = useRef<StudioLayout[]>([]);
  const redoStackRef = useRef<StudioLayout[]>([]);
  const dragOriginRef = useRef<{ nodeId: string; position: { x: number; y: number } } | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StudioNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [edgeLabelDraft, setEdgeLabelDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const library = useMemo(() => buildLibrary(types), [types]);
  const filteredLibrary = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    if (!query) return library;
    return library.filter((block) => block.name.toLowerCase().includes(query) || block.description.toLowerCase().includes(query));
  }, [library, libraryQuery]);

  const resetHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  const snapshotLayout = useCallback(() => cloneLayout({ nodes, edges }), [nodes, edges]);

  const pushUndo = useCallback(() => {
    undoStackRef.current.push(snapshotLayout());
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [snapshotLayout]);

  const applyLayout = useCallback((layout: StudioLayout) => {
    setNodes(layout.nodes);
    setEdges(layout.edges.map((edge) => ({ ...edge, type: 'studio' })));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    onError(null);
  }, [onError, setEdges, setNodes]);

  const loadLayout = useCallback(() => {
    const stored = readStoredLayout(chain.id);
    const fallback = layoutFromChain(chain, types);
    const next = normalizeLayout(stored?.nodes.length ? stored : fallback);
    setNodes(next.nodes);
    setEdges(next.edges.map((edge) => ({ ...edge, type: 'studio' })));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    resetHistory();
  }, [chain, types, resetHistory, setEdges, setNodes]);

  useEffect(() => {
    loadLayout();
  }, [loadLayout]);

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(document.fullscreenElement === studioRef.current);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);


  useEffect(() => {
    if (!nodes.length) return;
    writeStoredLayout(chain.id, { nodes, edges });
  }, [chain.id, nodes, edges]);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedType = types.find((type) => type.id === selectedNode?.data.processTypeId);
  const materialFlow = materialFlowForType(selectedType);

  useEffect(() => {
    setEdgeLabelDraft(typeof selectedEdge?.label === 'string' ? selectedEdge.label : '');
  }, [selectedEdge]);

  const undo = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(snapshotLayout());
    if (redoStackRef.current.length > 50) redoStackRef.current.shift();
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
    applyLayout(previous);
  }, [applyLayout, snapshotLayout]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(snapshotLayout());
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
    applyLayout(next);
  }, [applyLayout, snapshotLayout]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!canManage) return;
      const key = event.key.toLowerCase();
      if (!(event.ctrlKey || event.metaKey)) return;
      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        redo();
        return;
      }
      if (key === 'z') {
        event.preventDefault();
        undo();
        return;
      }
      if (key === 'y') {
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canManage, redo, undo]);

  function toggleFullscreen() {
    const element = studioRef.current;
    if (!element) return;
    if (document.fullscreenElement === element) {
      void document.exitFullscreen();
      return;
    }
    void element.requestFullscreen();
  }

  const onConnect = useCallback((connection: Connection) => {
    pushUndo();
    setEdges((current) => addEdge({ ...connection, ...defaultEdgeOptions }, current));
  }, [pushUndo, setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return;
    let block: StudioLibraryBlock;
    try {
      block = JSON.parse(raw) as StudioLibraryBlock;
    } catch {
      return;
    }
    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const node = createNodeFromBlock(block, position, nodes);
    if (!node) {
      onError('No empty grid cell is available here. Move or remove a block first.');
      return;
    }
    pushUndo();
    setNodes((current) => [...current, node]);
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    onError(null);
  }, [nodes, onError, pushUndo, reactFlow, setNodes]);

  function updateSelectedNode(patch: Partial<StudioNodeData>) {
    if (!selectedNodeId) return;
    setNodes((current) => current.map((node) => (
      node.id === selectedNodeId ? { ...node, data: { ...node.data, ...patch, name: patch.name ?? node.data.name } } : node
    )));
  }

  function updateSelectedEdgeLabel(label: string) {
    if (!selectedEdgeId) return;
    setEdges((current) => current.map((edge) => (
      edge.id === selectedEdgeId ? { ...edge, label: label.trim() || undefined } : edge
    )));
  }

  function removeSelected() {
    if (selectedNodeId) {
      pushUndo();
      setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
      setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
      setSelectedNodeId(null);
      return;
    }
    if (selectedEdgeId) {
      pushUndo();
      setEdges((current) => current.filter((edge) => edge.id !== selectedEdgeId));
      setSelectedEdgeId(null);
    }
  }

  async function saveChain() {
    if (!canManage) return;
    const steps = stepsFromLayout(nodes);
    if (!steps.length) {
      onError('Add at least one process block before saving the chain.');
      return;
    }
    setSaving(true);
    onError(null);
    try {
      const response = await fetch(`/api/processing-chains/${chain.id}/steps`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ steps }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Could not save chain');
      writeStoredLayout(chain.id, { nodes, edges });
      await onChainsChange();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not save chain');
    } finally {
      setSaving(false);
    }
  }

  const commonBlocks = filteredLibrary.filter((block) => block.section === 'common');
  const utilityBlocks = filteredLibrary.filter((block) => block.section === 'utility');

  return (
    <div ref={studioRef} className={`process-studio${fullscreen ? ' process-studio--fullscreen' : ''}`}>
      <div className="process-studio-head">
        <div>
          <h3 className="process-studio-title">Your milling process</h3>
          <p className="muted">Drag blocks onto the grid, then connect them with arrows.</p>
        </div>
        <div className="process-studio-head-actions">
          {canManage && (
            <div className="process-studio-history-actions">
              <IconButton type="button" disabled={!canUndo} onClick={undo} aria-label="Undo" title="Undo (Ctrl+Z)">↶</IconButton>
              <IconButton type="button" disabled={!canRedo} onClick={redo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">↷</IconButton>
            </div>
          )}
          <Button type="button" className="secondary" onClick={toggleFullscreen}>
            {fullscreen ? 'Exit full screen' : 'Full screen'}
          </Button>
          {canManage && (
            <>
              <Button type="button" className="secondary" onClick={loadLayout}>Reset layout</Button>
              <Button type="button" disabled={saving} onClick={() => void saveChain()}>{saving ? 'Saving…' : 'Save chain'}</Button>
            </>
          )}
        </div>
      </div>

      <div className="process-studio-layout">
        <aside className="process-studio-library">
          <p className="process-studio-section-label">Process library</p>
          <p className="muted process-studio-library-hint">Drag a block onto the grid.</p>
          <Input
            value={libraryQuery}
            onChange={(event) => setLibraryQuery(event.target.value)}
            placeholder="Search processes"
            aria-label="Search processes"
          />
          <div className="process-studio-library-groups">
            <div>
              <p className="process-studio-group-label">Common</p>
              <div className="process-studio-library-list">
                {commonBlocks.length ? commonBlocks.map((block) => <LibraryItem key={block.id} block={block} />) : (
                  <p className="muted process-studio-empty">No matching process types.</p>
                )}
              </div>
            </div>
            <div>
              <p className="process-studio-group-label">Utility</p>
              <div className="process-studio-library-list">
                {utilityBlocks.map((block) => <LibraryItem key={block.id} block={block} />)}
              </div>
            </div>
          </div>
        </aside>

        <div className="process-studio-canvas-wrap">
          <Canvas className="process-studio-canvas" onDragOver={onDragOver} onDrop={onDrop}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              connectionMode={ConnectionMode.Loose}
              connectionRadius={28}
              snapToGrid
              snapGrid={[STUDIO_GRID.col, STUDIO_GRID.row]}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
              minZoom={0.45}
              maxZoom={1.4}
              deleteKeyCode={canManage ? ['Backspace', 'Delete'] : null}
              nodesDraggable={canManage}
              nodesConnectable={canManage}
              elementsSelectable
              onNodeClick={(_, node) => {
                setSelectedNodeId(node.id);
                setSelectedEdgeId(null);
              }}
              onEdgeClick={(_, edge) => {
                setSelectedEdgeId(edge.id);
                setSelectedNodeId(null);
              }}
              onPaneClick={() => {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
              }}
              onNodeDragStart={(_, node) => {
                dragOriginRef.current = { nodeId: node.id, position: { ...node.position } };
              }}
              onNodeDragStop={(_, node) => {
                const origin = dragOriginRef.current?.nodeId === node.id ? dragOriginRef.current.position : node.position;
                dragOriginRef.current = null;
                const snapped = snapPosition(node.position);
                const occupied = isCellOccupied(nodes, snapped, node.id);
                const nextPosition = occupied ? origin : snapped;
                if (occupied && (nextPosition.x !== snapped.x || nextPosition.y !== snapped.y)) {
                  onError('That grid cell is already occupied.');
                } else {
                  onError(null);
                }
                if (nextPosition.x !== origin.x || nextPosition.y !== origin.y) {
                  pushUndo();
                }
                setNodes((current) => current.map((entry) => (
                  entry.id === node.id ? { ...entry, position: nextPosition } : entry
                )));
              }}
              onBeforeDelete={async () => {
                pushUndo();
                return true;
              }}
            >
              <Background variant={BackgroundVariant.Lines} gap={[STUDIO_GRID.col, STUDIO_GRID.row]} color="var(--canvas-grid)" />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(node) => {
                  if (node.type === 'storage') return '#D8C39A';
                  if (node.type === 'gate') return '#8FBF98';
                  return '#FFFFFF';
                }}
              />
            </ReactFlow>
          </Canvas>
        </div>

        <aside className="process-studio-detail">
          <p className="process-studio-section-label">Process details</p>
          <div className="process-studio-detail-body">
          {selectedNode ? (
            <>
              <h4 className="process-studio-detail-title">{selectedNode.data.name}</h4>
              <p className="muted process-studio-detail-hint">Click any block or connection to edit it.</p>
              <div className="process-studio-detail-fields">
                <Field label="Process name">
                  <Input
                    value={selectedNode.data.name}
                    onChange={(event) => updateSelectedNode({ name: event.target.value })}
                    aria-label="Process name"
                    readOnly={!canManage}
                  />
                </Field>
                <Field label="Machine / line">
                  <Input
                    value={selectedNode.data.machineLine ?? ''}
                    onChange={(event) => updateSelectedNode({ machineLine: event.target.value })}
                    placeholder="Whitener 01"
                    aria-label="Machine or line"
                    readOnly={!canManage}
                  />
                </Field>
                <Field label="Capacity">
                  <Input
                    value={selectedNode.data.capacity ?? ''}
                    onChange={(event) => updateSelectedNode({ capacity: event.target.value })}
                    placeholder="5 tonne / hour"
                    aria-label="Capacity"
                    readOnly={!canManage}
                  />
                </Field>
              </div>

              {(materialFlow.inputs.length || materialFlow.outputs.length) && (
                <div className="process-studio-material">
                  <p className="process-studio-group-label">Material flow</p>
                  {materialFlow.inputs.length > 0 && (
                    <div className="process-studio-material-group">
                      <span className="process-studio-material-label">Input</span>
                      {materialFlow.inputs.map((line) => (
                        <div className="process-studio-material-pill process-studio-material-pill--input" key={`${line.item_id}-${line.semantic_type}`}>
                          <strong>{line.item_name ?? 'Input item'}</strong>
                          <small>{line.semantic_type}</small>
                        </div>
                      ))}
                    </div>
                  )}
                  {materialFlow.outputs.length > 0 && (
                    <div className="process-studio-material-group">
                      <span className="process-studio-material-label">Outputs</span>
                      {materialFlow.outputs.map((line) => (
                        <div className="process-studio-material-pill" key={`${line.item_id}-${line.semantic_type}`}>
                          <strong>{line.item_name ?? 'Output item'}</strong>
                          <small>{line.semantic_type === 'main' ? 'Main output' : line.semantic_type}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Field label="Notes">
                <Input
                  value={selectedNode.data.notes ?? ''}
                  onChange={(event) => updateSelectedNode({ notes: event.target.value })}
                  aria-label="Notes"
                  readOnly={!canManage}
                />
              </Field>

              {canManage && (
                <div className="process-studio-detail-actions">
                  <Button type="button" className="secondary" onClick={removeSelected}>Remove block</Button>
                </div>
              )}
            </>
          ) : selectedEdge ? (
            <>
              <h4 className="process-studio-detail-title">Connection</h4>
              <p className="muted process-studio-detail-hint">Label the material moving through this arrow.</p>
              <Field label="Flow label">
                <Input
                  value={edgeLabelDraft}
                  onChange={(event) => {
                    setEdgeLabelDraft(event.target.value);
                    updateSelectedEdgeLabel(event.target.value);
                  }}
                  placeholder="Brown rice"
                  aria-label="Connection label"
                  readOnly={!canManage}
                />
              </Field>
              {canManage && (
                <div className="process-studio-detail-actions">
                  <Button type="button" className="secondary" onClick={removeSelected}>Remove connection</Button>
                </div>
              )}
            </>
          ) : (
            <p className="muted process-studio-empty">Select a block on the canvas to edit machine details and material flow.</p>
          )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function ProcessChainStudio({
  chains,
  types,
  canManage,
  onChainsChange,
  onError,
}: {
  chains: ProcessingChainRecord[];
  types: CatalogProcessType[];
  canManage: boolean;
  onChainsChange: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [selectedChainId, setSelectedChainId] = useState(chains[0]?.id ?? '');
  const [creating, setCreating] = useState(false);
  const [newChainName, setNewChainName] = useState('');

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

  async function createChain() {
    if (!canManage || !newChainName.trim()) return;
    setCreating(true);
    onError(null);
    try {
      const response = await fetch('/api/processing-chains', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: newChainName.trim() }),
      });
      const body = await response.json() as { id?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Could not create chain');
      setNewChainName('');
      await onChainsChange();
      if (body.id) setSelectedChainId(body.id);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not create chain');
    } finally {
      setCreating(false);
    }
  }

  if (!chains.length) {
    return (
      <div className="process-studio-empty-state">
        <p className="muted">No processing chains yet. Create one to design your milling flow on the canvas.</p>
        {canManage && (
          <div className="process-studio-create">
            <Input value={newChainName} onChange={(event) => setNewChainName(event.target.value)} placeholder="Chain name" aria-label="Chain name" />
            <Button type="button" disabled={creating} onClick={() => void createChain()}>{creating ? 'Creating…' : 'Create chain'}</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="process-studio-shell">
      <div className="process-studio-chain-bar">
        <Field label="Processing chain">
          <Select value={selectedChainId} onChange={(event) => setSelectedChainId(event.target.value)} aria-label="Processing chain">
            {chains.map((chain) => <option key={chain.id} value={chain.id}>{chain.name}</option>)}
          </Select>
        </Field>
        {canManage && (
          <div className="process-studio-create">
            <Input value={newChainName} onChange={(event) => setNewChainName(event.target.value)} placeholder="New chain name" aria-label="New chain name" />
            <Button type="button" className="secondary" disabled={creating} onClick={() => void createChain()}>+ Add chain</Button>
          </div>
        )}
      </div>
      {selectedChain && (
        <ReactFlowProvider>
          <StudioCanvas
            chain={selectedChain}
            types={types}
            canManage={canManage}
            onChainsChange={onChainsChange}
            onError={onError}
          />
        </ReactFlowProvider>
      )}
    </div>
  );
}
