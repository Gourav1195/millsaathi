import type { Edge, Node } from '@xyflow/react';
import type { CatalogProcessType } from '../components/process-catalog';

export const STUDIO_GRID = { col: 200, row: 140 };
export const STUDIO_NODE_SIZE = { width: 176, height: 104 };

export type StudioNodeKind = 'process' | 'storage' | 'gate' | 'custom';

export type StudioNodeData = {
  kind: StudioNodeKind;
  name: string;
  description?: string;
  processTypeId?: string;
  machineLine?: string;
  capacity?: string;
  notes?: string;
};

export type StudioLibraryBlock = {
  id: string;
  kind: StudioNodeKind;
  name: string;
  description: string;
  processTypeId?: string;
  section: 'common' | 'utility';
};

export type ProcessingChainStep = {
  id: string;
  process_type_id: string;
  step_number: number;
  process_type_name?: string;
  process_type_description?: string | null;
  notes?: string | null;
};

export type ProcessingChainRecord = {
  id: string;
  name: string;
  description?: string | null;
  steps: ProcessingChainStep[];
};

export type StudioLayout = {
  nodes: Node<StudioNodeData>[];
  edges: Edge[];
};

const UTILITY_BLOCKS: Omit<StudioLibraryBlock, 'section'>[] = [
  { id: 'utility-storage', kind: 'storage', name: 'Storage / Godown', description: 'Hold material between steps.' },
  { id: 'utility-custom', kind: 'custom', name: 'Custom process', description: 'Define your own milling step.' },
  { id: 'utility-gate', kind: 'gate', name: 'Gate / Checkpoint', description: 'QC check or routing decision.' },
];

export function buildLibrary(types: CatalogProcessType[]): StudioLibraryBlock[] {
  const common = types
    .filter((type) => !type.deleted_at)
    .map((type) => ({
      id: type.id,
      kind: 'process' as const,
      name: type.name,
      description: type.description?.trim() || 'Drag onto the canvas grid.',
      processTypeId: type.id,
      section: 'common' as const,
    }));
  const utility = UTILITY_BLOCKS.map((block) => ({ ...block, section: 'utility' as const }));
  return [...common, ...utility];
}

export function snapPosition(position: { x: number; y: number }) {
  return {
    x: Math.round(position.x / STUDIO_GRID.col) * STUDIO_GRID.col,
    y: Math.round(position.y / STUDIO_GRID.row) * STUDIO_GRID.row,
  };
}

export function layoutStorageKey(chainId: string) {
  return `millsaathi-process-studio:${chainId}`;
}

export function readStoredLayout(chainId: string): StudioLayout | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(layoutStorageKey(chainId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudioLayout;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredLayout(chainId: string, layout: StudioLayout) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(layoutStorageKey(chainId), JSON.stringify(layout));
}

function nodeFromBlock(block: StudioLibraryBlock, position: { x: number; y: number }, nodeId: string): Node<StudioNodeData> {
  return {
    id: nodeId,
    type: block.kind,
    position: snapPosition(position),
    data: {
      kind: block.kind,
      name: block.name,
      description: block.description,
      processTypeId: block.processTypeId,
      machineLine: '',
      capacity: '',
      notes: '',
    },
  };
}

export function layoutFromChain(chain: ProcessingChainRecord, types: CatalogProcessType[]): StudioLayout {
  const nodes: Node<StudioNodeData>[] = chain.steps
    .slice()
    .sort((a, b) => a.step_number - b.step_number)
    .map((step, index) => {
      const type = types.find((candidate) => candidate.id === step.process_type_id);
      const col = index % 4;
      const row = Math.floor(index / 4);
      return {
        id: step.id,
        type: 'process',
        position: snapPosition({ x: col * STUDIO_GRID.col + 48, y: row * STUDIO_GRID.row + 48 }),
        data: {
          kind: 'process',
          name: step.process_type_name ?? type?.name ?? 'Process',
          description: step.process_type_description ?? type?.description ?? '',
          processTypeId: step.process_type_id,
          machineLine: '',
          capacity: '',
          notes: step.notes ?? '',
        },
      };
    });

  const edges: Edge[] = nodes.slice(1).map((node, index) => ({
    id: `edge-${nodes[index].id}-${node.id}`,
    source: nodes[index].id,
    target: node.id,
    type: 'smoothstep',
  }));

  return { nodes, edges };
}

export function createNodeFromBlock(block: StudioLibraryBlock, position: { x: number; y: number }) {
  const nodeId = `node-${block.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return nodeFromBlock(block, position, nodeId);
}

export function stepsFromLayout(nodes: Node<StudioNodeData>[]) {
  const processNodes = nodes
    .filter((node) => node.data.processTypeId)
    .slice()
    .sort((left, right) => {
      const rowDelta = left.position.y - right.position.y;
      if (Math.abs(rowDelta) > STUDIO_GRID.row / 2) return rowDelta;
      return left.position.x - right.position.x;
    });

  return processNodes.map((node, index) => ({
    process_type_id: String(node.data.processTypeId),
    notes: node.data.notes?.trim() || null,
    step_number: index + 1,
  }));
}

export function materialFlowForType(type: CatalogProcessType | undefined) {
  if (!type?.template_lines?.length) return { inputs: [], outputs: [] };
  const inputs = type.template_lines.filter((line) => line.line_type === 'INPUT');
  const outputs = type.template_lines.filter((line) => line.line_type === 'OUTPUT' || line.line_type === 'LOSS');
  return { inputs, outputs };
}
