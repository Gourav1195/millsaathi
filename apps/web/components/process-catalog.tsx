'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Button,
  DataTable,
  EmptyState,
  Field,
  Input,
  Panel,
  Select,
  TableActions,
  TableCard,
} from './ui';
import { api, json } from '../lib/api';
import { useArchiveDialog } from './archive-dialog';

export type CatalogProcessType = {
  id: string;
  name: string;
  description?: string | null;
  deleted_at?: string | null;
  default_unit?: string | null;
  default_destination_godown_id?: string | null;
  template_lines?: CatalogTemplateLine[];
};

type CatalogTemplateLine = {
  id?: string;
  line_type: 'INPUT' | 'OUTPUT' | 'LOSS';
  semantic_type: string;
  item_id: string;
  item_name?: string;
  default_unit?: string | null;
  default_godown_id?: string | null;
  required?: boolean | number;
  auto_calculate?: boolean | number;
};

type DraftLine = {
  line_type: 'INPUT' | 'OUTPUT' | 'LOSS';
  semantic_type: string;
  item_id: string;
  default_unit: string;
  default_godown_id: string;
  required: boolean;
  auto_calculate: boolean;
};

type Reference = { id: string; name: string };

const CATALOG_COLUMNS = [
  { id: 'name', label: 'Name' },
  { id: 'description', label: 'Description' },
  { id: 'template', label: 'Template' },
  { id: 'status', label: 'Status' },
  { id: 'actions', label: '' },
];

const units = ['KG', 'QUINTAL', 'TONNE'];

function emptyLine(preferredUnit: string): DraftLine {
  return {
    line_type: 'OUTPUT',
    semantic_type: 'main',
    item_id: '',
    default_unit: preferredUnit,
    default_godown_id: '',
    required: true,
    auto_calculate: false,
  };
}

function toDraftLine(line: CatalogTemplateLine, preferredUnit: string): DraftLine {
  return {
    line_type: line.line_type,
    semantic_type: line.semantic_type,
    item_id: line.item_id,
    default_unit: line.default_unit ?? preferredUnit,
    default_godown_id: line.default_godown_id ?? '',
    required: line.required !== false && line.required !== 0,
    auto_calculate: line.auto_calculate === true || line.auto_calculate === 1,
  };
}

export function ProcessCatalog({
  open,
  onClose,
  types,
  onChanged,
  preferredUnit = 'QUINTAL',
}: {
  open: boolean;
  onClose: () => void;
  types: CatalogProcessType[];
  onChanged: () => Promise<void>;
  preferredUnit?: string;
}) {
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [defaultUnit, setDefaultUnit] = useState(preferredUnit);
  const [defaultGodownId, setDefaultGodownId] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [items, setItems] = useState<Reference[]>([]);
  const [godowns, setGodowns] = useState<Reference[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const { requestArchive } = useArchiveDialog();

  useEffect(() => {
    if (!open) return;
    void api<{ items: Reference[]; godowns: Reference[] }>('/api/overview')
      .then((body) => {
        setItems(body.items ?? []);
        setGodowns(body.godowns ?? []);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load catalog references'));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setEditingTypeId(null);
      setCreatingNew(false);
      setNewName('');
      setNewDescription('');
      setError(null);
    }
  }, [open]);

  const editingType = types.find((type) => type.id === editingTypeId) ?? null;

  useEffect(() => {
    if (!editingTypeId) return;
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingTypeId]);

  function startEdit(type: CatalogProcessType) {
    setError(null);
    setCreatingNew(false);
    setEditingTypeId(type.id);
    setDefaultUnit(type.default_unit ?? preferredUnit);
    setDefaultGodownId(type.default_destination_godown_id ?? '');
    setDraftLines((type.template_lines ?? []).map((line) => toDraftLine(line, preferredUnit)));
  }

  async function createType() {
    if (!newName.trim()) {
      setError('Enter a process name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api('/api/process-types', json('POST', { name: newName.trim(), description: newDescription.trim() }));
      setCreatingNew(false);
      setNewName('');
      setNewDescription('');
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create process type');
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplate() {
    if (!editingType) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/process-types/${editingType.id}/template`, json('PUT', {
        default_unit: defaultUnit,
        default_destination_godown_id: defaultGodownId || null,
        lines: draftLines.map((line, index) => ({
          line_type: line.line_type,
          semantic_type: line.semantic_type,
          item_id: line.item_id,
          default_unit: line.default_unit,
          default_godown_id: line.default_godown_id || null,
          required: line.required,
          auto_calculate: line.auto_calculate,
          sort_order: index,
        })),
      }));
      setEditingTypeId(null);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save process template');
    } finally {
      setSaving(false);
    }
  }

  function archiveType(type: CatalogProcessType) {
    requestArchive({
      title: 'Archive process type?',
      name: type.name,
      description: 'Existing process runs will remain available.',
      confirmLabel: 'Archive process type',
      onConfirm: async () => {
        await api(`/api/process-types/${type.id}`, json('DELETE', {}));
        if (editingTypeId === type.id) setEditingTypeId(null);
        await onChanged();
      },
    });
  }

  async function restoreType(id: string) {
    setError(null);
    try {
      await api(`/api/process-types/${id}/restore`, { method: 'PATCH', credentials: 'include' });
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not restore process type');
    }
  }

  if (!open) return null;

  return (
    <>
      <TableCard
        className="process-catalog-card"
        title="Process types"
        subtitle="Add, edit, reorder or archive the reusable process flows."
        actions={
          <div className="process-catalog-actions">
            {creatingNew ? (
              <div className="process-inline-create">
                <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Process name" aria-label="Process name" />
                <Input value={newDescription} onChange={(event) => setNewDescription(event.target.value)} placeholder="Description" aria-label="Description" />
                <Button type="button" disabled={saving} onClick={() => void createType()}>Create type</Button>
              </div>
            ) : (
              <Button type="button" className="secondary" onClick={() => { setCreatingNew(true); setEditingTypeId(null); }}>+ Add process type</Button>
            )}
            <Button type="button" className="secondary" onClick={onClose}>Close</Button>
          </div>
        }
      >
        {error && <p className="error" style={{ padding: '0 22px 12px' }}>{error}</p>}
        <DataTable columns={CATALOG_COLUMNS}>
          {types.length ? types.map((type) => {
            const archived = Boolean(type.deleted_at);
            const configured = (type.template_lines ?? []).length > 0;
            return (
              <tr key={type.id}>
                <td><strong>{type.name}</strong></td>
                <td>{type.description || '—'}</td>
                <td>{configured ? 'Configured' : 'Manual fallback'}</td>
                <td>{archived ? 'Archived' : 'Active'}</td>
                <td>
                  <TableActions>
                    {!archived && <Button type="button" className="secondary" onClick={() => startEdit(type)}>Edit</Button>}
                    <Button
                      type="button"
                      className="secondary"
                      onClick={() => void (archived ? restoreType(type.id) : archiveType(type))}
                    >
                      {archived ? 'Unarchive' : 'Archive'}
                    </Button>
                  </TableActions>
                </td>
              </tr>
            );
          }) : (
            <tr>
              <td colSpan={CATALOG_COLUMNS.length}><EmptyState>No process types yet.</EmptyState></td>
            </tr>
          )}
        </DataTable>
      </TableCard>
      {editingType && (
        <div ref={editorRef}>
        <Panel className="process-inline-editor" title={`Edit ${editingType.name}`}>
          <p className="muted process-inline-editor-hint">
            Configure flow lines for this process. New workspace drafts use your preferred unit ({preferredUnit.toLowerCase()}) by default.
          </p>
          <div className="process-inline-editor-fields">
            <Field label="Default unit">
              <Select value={defaultUnit} onChange={(event) => setDefaultUnit(event.target.value)} aria-label="Default unit">
                {units.map((unit) => <option key={unit} value={unit}>{unit.toLowerCase()}</option>)}
              </Select>
            </Field>
            <Field label="Default destination godown">
              <Select value={defaultGodownId} onChange={(event) => setDefaultGodownId(event.target.value)} aria-label="Default destination godown">
                <option value="">Process default</option>
                {godowns.map((godown) => <option key={godown.id} value={godown.id}>{godown.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="template-grid-head">
            <span>Flow line</span>
            <span>Meaning</span>
            <span>Item</span>
            <span>Unit</span>
            <span>Godown</span>
            <span>Rules</span>
            <span />
          </div>
          <div className="template-rows inline-template-rows">
            {draftLines.length ? draftLines.map((line, index) => (
              <div className="template-row inline-template-row" key={`${line.line_type}-${index}`}>
                <Select value={line.line_type} onChange={(event) => setDraftLines((current) => current.map((entry, i) => i === index ? { ...entry, line_type: event.target.value as DraftLine['line_type'] } : entry))} aria-label="Flow line type">
                  <option value="INPUT">Input</option>
                  <option value="OUTPUT">Output</option>
                  <option value="LOSS">Loss</option>
                </Select>
                <Select value={line.semantic_type} onChange={(event) => setDraftLines((current) => current.map((entry, i) => i === index ? { ...entry, semantic_type: event.target.value } : entry))} aria-label="Flow line meaning">
                  <option value="input">Input</option>
                  <option value="main">Main output</option>
                  <option value="byproduct">By-product</option>
                  <option value="waste">Waste / loss</option>
                </Select>
                <Select value={line.item_id} onChange={(event) => setDraftLines((current) => current.map((entry, i) => i === index ? { ...entry, item_id: event.target.value } : entry))} aria-label="Flow line item">
                  <option value="">Choose item</option>
                  {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
                <Select value={line.default_unit} onChange={(event) => setDraftLines((current) => current.map((entry, i) => i === index ? { ...entry, default_unit: event.target.value } : entry))} aria-label="Flow line unit">
                  {units.map((unit) => <option key={unit} value={unit}>{unit.toLowerCase()}</option>)}
                </Select>
                <Select value={line.default_godown_id} onChange={(event) => setDraftLines((current) => current.map((entry, i) => i === index ? { ...entry, default_godown_id: event.target.value } : entry))} aria-label="Flow line godown">
                  <option value="">Process default</option>
                  {godowns.map((godown) => <option key={godown.id} value={godown.id}>{godown.name}</option>)}
                </Select>
                <div className="template-checks">
                  <label className="template-check"><input type="checkbox" checked={line.required} onChange={(event) => setDraftLines((current) => current.map((entry, i) => i === index ? { ...entry, required: event.target.checked } : entry))} />Required</label>
                  <label className="template-check"><input type="checkbox" checked={line.auto_calculate} onChange={(event) => setDraftLines((current) => current.map((entry, i) => i === index ? { ...entry, auto_calculate: event.target.checked } : entry))} />Auto loss</label>
                </div>
                <Button type="button" className="secondary" onClick={() => setDraftLines((current) => current.filter((_, i) => i !== index))}>Remove</Button>
              </div>
            )) : (
              <p className="muted" style={{ padding: '0 22px' }}>No flow lines yet. Add one to configure this process template.</p>
            )}
          </div>
          <div className="process-inline-editor-actions">
            <Button type="button" className="secondary" onClick={() => setDraftLines((current) => [...current, emptyLine(preferredUnit)])}>+ Add flow line</Button>
            <span />
            <Button type="button" className="secondary" onClick={() => setEditingTypeId(null)}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={() => void saveTemplate()}>{saving ? 'Saving…' : 'Save process'}</Button>
          </div>
        </Panel>
        </div>
      )}
    </>
  );
}
