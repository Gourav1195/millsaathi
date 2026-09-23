'use client';

import { Button, IconButton } from './ui';

export function TableEditModeButton({
  enabled,
  editMode,
  onToggle,
}: {
  enabled: boolean;
  editMode: boolean;
  onToggle: () => void;
}) {
  if (!enabled) return null;
  return (
    <Button type="button" className={editMode ? 'secondary' : 'quiet'} onClick={onToggle}>
      {editMode ? 'Done' : 'Edit'}
    </Button>
  );
}

export function TableEditModeBar({
  visible,
  selectedCount,
  onArchive,
  archiving,
  archiveLabel = 'Archive selected',
}: {
  visible: boolean;
  selectedCount: number;
  onArchive: () => void;
  archiving?: boolean;
  archiveLabel?: string;
}) {
  if (!visible) return null;
  return (
    <div className="table-edit-mode-bar">
      <Button type="button" className="secondary" disabled={!selectedCount || archiving} onClick={onArchive}>
        {archiving ? 'Archiving…' : `${archiveLabel} (${selectedCount})`}
      </Button>
    </div>
  );
}

export function TableArchiveCell({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <td className="table-edit-col">
      <input
        type="checkbox"
        className="table-archive-checkbox"
        aria-label={`Select ${label}`}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </td>
  );
}

export function TableEditCell({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <td className="table-edit-col">
      <IconButton type="button" className="row-edit-btn" aria-label={`Edit ${label}`} title="Edit" onClick={onClick}>
        ✎
      </IconButton>
    </td>
  );
}

export function TableSelectAllBar({
  visible,
  checked,
  onChange,
  label,
}: {
  visible: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  if (!visible) return null;
  return (
    <div className="table-edit-select-all">
      <label>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        {' '}{label}
      </label>
    </div>
  );
}
