'use client';

import { useRef, useState } from 'react';
import { Button } from './ui';
import { api, json } from '../lib/api';
import { parseSpreadsheetFile, type SpreadsheetRow } from '../lib/spreadsheet';

type MappedRows = { rows: SpreadsheetRow[]; summary: string[] };

type SpreadsheetImportButtonProps = {
  label?: string;
  templateHref?: string;
  maxRows: number;
  mapRows: (rows: SpreadsheetRow[]) => MappedRows;
  validate: (rows: SpreadsheetRow[]) => Promise<{
    rows: Array<{ row: SpreadsheetRow; error?: string | null; duplicate?: boolean }>;
    errors?: number;
    duplicates?: number;
  }>;
  commit: (rows: SpreadsheetRow[]) => Promise<{ imported?: number; skipped?: number; failed?: number }>;
  onImported: () => void | Promise<void>;
  onError: (message: string) => void;
  disabled?: boolean;
};

export function SpreadsheetImportButton({
  label = 'Import CSV/XLSX',
  templateHref,
  maxRows,
  mapRows,
  validate,
  commit,
  onImported,
  onError,
  disabled,
}: SpreadsheetImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const raw = await parseSpreadsheetFile(file);
      if (!raw.length || raw.length > maxRows) {
        throw new Error(`File must contain between 1 and ${maxRows.toLocaleString('en-IN')} data rows.`);
      }
      const mapped = mapRows(raw);
      if (!mapped.summary.length) {
        throw new Error('No recognized columns were found. Download the template and try again.');
      }
      if (!window.confirm(`Detected column mapping:\n${mapped.summary.join('\n')}\n\nContinue to preview and validate these rows?`)) {
        return;
      }
      const check = await validate(mapped.rows);
      const clean = check.rows
        .filter((entry) => !entry.error && !entry.duplicate)
        .map((entry) => entry.row);
      if (
        !clean.length
        || !window.confirm(
          `Preview: ${clean.length} valid, ${check.duplicates ?? 0} duplicate(s), ${check.errors ?? 0} error(s). Import valid rows?`,
        )
      ) {
        return;
      }
      const result = await commit(clean);
      window.alert(
        `Imported ${result.imported ?? clean.length}, skipped ${result.skipped ?? 0}, failed ${result.failed ?? 0}.`,
      );
      await onImported();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Import failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      {templateHref ? (
        <a className="ui-link" href={templateHref}>Template</a>
      ) : null}
      <Button
        type="button"
        className="secondary"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Importing…' : label}
      </Button>
    </>
  );
}

export async function validatePartyImport(kind: 'supplier' | 'buyer', rows: SpreadsheetRow[]) {
  return api<{
    rows: Array<{ row: SpreadsheetRow; error?: string | null; duplicate?: boolean }>;
    errors?: number;
    duplicates?: number;
  }>('/api/parties/import/validate', json('POST', { kind, rows }));
}

export async function commitPartyImport(kind: 'supplier' | 'buyer', rows: SpreadsheetRow[]) {
  return api<{ imported: number; skipped: number; failed: number }>(
    '/api/parties/import/commit',
    json('POST', { kind, rows, skip_duplicates: true }),
  );
}

export async function validateSaudaImport(rows: SpreadsheetRow[]) {
  const check = await api<{
    rows: Array<{ row_number: number; error: string | null }>;
    valid: number;
    errors: number;
  }>('/api/saudas/import/validate', json('POST', { rows }));
  if (check.errors) {
    const examples = check.rows
      .filter((entry) => entry.error)
      .slice(0, 3)
      .map((entry) => `Row ${entry.row_number}: ${entry.error}`)
      .join('\n');
    throw new Error(`Import has ${check.errors} error(s).\n${examples}`);
  }
  return {
    rows: rows.map((row, index) => ({ row, error: check.rows[index]?.error })),
    errors: check.errors,
    duplicates: 0,
  };
}

export async function commitSaudaImport(rows: SpreadsheetRow[]) {
  return api<{ imported: number }>('/api/saudas/import/commit', json('POST', { rows }));
}
