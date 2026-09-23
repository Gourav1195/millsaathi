import { useCallback, useMemo, useState } from 'react';
import type { TableColumn } from '../components/ui';

export function useTableEditMode() {
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  );

  const enterEditMode = useCallback(() => setEditMode(true), []);

  const exitEditMode = useCallback(() => {
    setEditMode(false);
    setSelected({});
  }, []);

  const toggleEditMode = useCallback(() => {
    if (editMode) exitEditMode();
    else enterEditMode();
  }, [editMode, enterEditMode, exitEditMode]);

  const toggleSelected = useCallback((id: string, checked: boolean) => {
    setSelected((current) => ({ ...current, [id]: checked }));
  }, []);

  const togglePageSelected = useCallback((ids: string[], checked: boolean) => {
    setSelected((current) => {
      const next = { ...current };
      for (const id of ids) next[id] = checked;
      return next;
    });
  }, []);

  const isPageFullySelected = useCallback(
    (ids: string[]) => ids.length > 0 && ids.every((id) => selected[id]),
    [selected],
  );

  return {
    editMode,
    selected,
    selectedIds,
    enterEditMode,
    exitEditMode,
    toggleEditMode,
    toggleSelected,
    togglePageSelected,
    isPageFullySelected,
  };
}

export function withEditModeColumns(
  base: TableColumn[],
  editMode: boolean,
  options: { canEdit?: boolean; canArchive?: boolean },
): TableColumn[] {
  const dataColumns = base.filter((column) => column.id !== 'actions' && column.id !== 'select' && column.id !== 'edit');
  if (!editMode) return dataColumns;

  const prefix: TableColumn[] = [];
  if (options.canArchive) prefix.push({ id: 'select', label: '', className: 'table-edit-col' });
  if (options.canEdit) prefix.push({ id: 'edit', label: '', className: 'table-edit-col' });
  return [...prefix, ...dataColumns];
}
