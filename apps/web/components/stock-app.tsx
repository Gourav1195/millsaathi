'use client';

import { AppLink } from './app-link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader } from './app-header';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  FilterSearch,
  FormActions,
  FormGrid,
  Input,
  PageHeader,
  Panel,
  RangeField,
  Select,
  TableActions,
  TableCard,
  TableFilters,
  TablePager,
  Textarea,
  Tab,
  TabRow,
} from './ui';
import { millHeaderMeta } from '../lib/app-meta';
import { filterRows, paginate, PAGE_SIZE, uniqueValues } from '../lib/list-view';
import { formatDate, formatQtl, formatRupee, formatSaudaCode } from '../lib/format';
import {
  proRatedSaudaValuePaise,
  qtlFromKg,
  saudaIsOpenForStock,
  saudaMatchesQuery,
  saudaRemainingKg,
  type SaudaStockRef,
} from '../lib/sauda-stock';
import { useOperationalCounts } from '../lib/operational-counts';
import { TableClampedText } from './table-cell-detail';
import { TableEditCell, TableEditModeButton } from './table-edit-mode';
import { can, canViewFinance } from '../lib/permissions';
import { useTableEditMode, withEditModeColumns } from '../lib/table-edit-mode';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';
import { groupLotsForDisplay } from '../lib/stock-groups';
import { stockReceiptBagInfo, stockReceiptRemainingKg } from '../lib/stock-receipts';
import { receiptProRatedValuePaise } from '../lib/stock-settlement';
import { splitLot } from '../lib/chain-run';
import { formatDualQuantity, itemUsesVariableBags } from '../../../shared/quantity';
import { StockSettlementDialog } from './stock-settlement-dialog';
import { StockLedger } from './stock-ledger';
import { LotValueCell } from './lot-value-cell';
import { intakeLinesByGate, type GateIntakeLineRef } from '../lib/lot-value-breakdown';

type Lot = {
  id: string;
  code: string;
  item_id?: string;
  item_name?: string;
  qty_kg?: number;
  bag_count?: number | null;
  entered_quantity?: number | null;
  entered_unit?: string | null;
  godown_id?: string | null;
  godown_name?: string;
  in_date?: string;
  moisture_pct?: number | null;
  value_paise?: number;
  note?: string | null;
  sauda_id?: string | null;
  sauda_code?: string | null;
  gate_entry_id?: string | null;
  gate_token_no?: string | null;
};

type Godown = { id: string; name: string; stock_kg?: number; capacity_kg?: number };
type Item = {
  id: string;
  name: string;
  tracking_mode?: string | null;
  package_unit?: string | null;
  package_quantity_base?: number | null;
  gate_bag_count_required?: number | null;
};
type Receipt = {
  id: string;
  token_no?: string;
  supplier_name?: string;
  item_name?: string;
  item_id?: string;
  net_kg?: number;
  allocated_qty_kg?: number;
  allocated_bag_count?: number;
  observed_bag_count?: number | null;
  stock_status?: string;
  moisture_pct?: number | null;
  sauda_rate_paise_per_qtl?: number;
  gate_rate_paise_per_qtl?: number;
  stock_note?: string | null;
  can_reopen?: number | boolean;
};

type Overview = {
  lots: Lot[];
  gate_intake_lines?: GateIntakeLineRef[];
  saudas?: SaudaStockRef[];
  godowns: Godown[];
  items: Item[];
  pending_receipts: Receipt[];
  rejected_receipts: Receipt[];
};

type LotForm = {
  quantity: string;
  unit: string;
  godown_id: string;
  moisture: string;
  value: string;
  note: string;
};

type NewLotMode = 'sauda' | 'manual';

type NewLotForm = {
  mode: NewLotMode;
  sauda_id: string;
  saudaQuery: string;
  godown_id: string;
  item_id: string;
  quantity: string;
  moisture: string;
  value: string;
  note: string;
};

type AcceptUndo = {
  lotId: string;
  lotCode: string;
  tokenNo?: string;
};

const ACCEPT_UNDO_SECONDS = 10;
const ACCEPT_UNDO_START = ACCEPT_UNDO_SECONDS - 1;

const pct = (value: number | null | undefined) =>
  value == null ? '—' : `${value.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;

const initialEditForm = (lot: Lot): LotForm => ({
  quantity: String((lot.qty_kg ?? 0) / 100),
  unit: 'QUINTAL',
  godown_id: lot.godown_id ?? '',
  moisture: lot.moisture_pct == null ? '' : String(lot.moisture_pct),
  value: lot.value_paise == null ? '' : String(lot.value_paise / 100),
  note: lot.note ?? '',
});

const emptyNewForm = (godownId = ''): NewLotForm => ({
  mode: 'sauda',
  sauda_id: '',
  saudaQuery: '',
  godown_id: godownId,
  item_id: '',
  quantity: '',
  moisture: '',
  value: '',
  note: '',
});

function godownFill(stockKg: number, capacityKg: number) {
  if (capacityKg <= 0) return { fill: 0, tone: 'success' as const };
  const fill = Math.min(100, Math.round((stockKg / capacityKg) * 100));
  if (fill > 85) return { fill, tone: 'danger' as const };
  if (fill > 60) return { fill, tone: 'warning' as const };
  return { fill, tone: 'success' as const };
}

function ExpandChevron({ expanded }: { expanded: boolean }) {
  return <span className="receipt-expand-chevron" aria-hidden="true">{expanded ? '⌃' : '⌄'}</span>;
}

export function StockApp() {
  const { session, sessionError } = useSession();
  const { refreshOperationalCounts } = useOperationalCounts();
  const headerMeta = millHeaderMeta(session);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Lot | null>(null);
  const [editForm, setEditForm] = useState<LotForm | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<NewLotForm>(() => emptyNewForm());
  const [receiptGodowns, setReceiptGodowns] = useState<Record<string, string>>({});
  const [settlementReceipt, setSettlementReceipt] = useState<Receipt | null>(null);
  const [receiptsExpanded, setReceiptsExpanded] = useState(false);
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const [rejectedExpanded, setRejectedExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [acceptUndo, setAcceptUndo] = useState<AcceptUndo | null>(null);
  const [acceptUndoCountdown, setAcceptUndoCountdown] = useState<number | null>(null);
  const [splitChildKg, setSplitChildKg] = useState('');
  const [splitChildBags, setSplitChildBags] = useState('');
  const [splitNote, setSplitNote] = useState('');
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const acceptUndoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tableEdit = useTableEditMode();

  const load = async () => {
    const data = await api<Overview>('/api/overview');
    setOverview(data);
    await refreshOperationalCounts();
    const defaultGodown = data.godowns[0]?.id ?? '';
    setNewForm((current) => ({ ...current, godown_id: current.godown_id || defaultGodown }));
    setReceiptGodowns((current) => {
      const next = { ...current };
      for (const receipt of data.pending_receipts ?? []) {
        if (!next[receipt.id]) next[receipt.id] = defaultGodown;
      }
      return next;
    });
  };

  useEffect(() => {
    if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load stock'));
  }, [session]);

  useEffect(() => {
    const dialog = editDialogRef.current;
    if (!dialog) return;
    if (editing && editForm && !dialog.open) dialog.showModal();
    if (!editing && dialog.open) dialog.close();
  }, [editing, editForm]);

  useEffect(() => () => {
    if (acceptUndoIntervalRef.current) clearInterval(acceptUndoIntervalRef.current);
  }, []);

  function clearAcceptUndoTimers() {
    if (acceptUndoIntervalRef.current) clearInterval(acceptUndoIntervalRef.current);
    acceptUndoIntervalRef.current = null;
  }

  function scheduleAcceptUndo(next: AcceptUndo) {
    clearAcceptUndoTimers();
    setAcceptUndo(next);
    setAcceptUndoCountdown(ACCEPT_UNDO_START);
    acceptUndoIntervalRef.current = setInterval(() => {
      setAcceptUndoCountdown((current) => {
        if (current == null || current <= 0) {
          clearAcceptUndoTimers();
          setAcceptUndo(null);
          return null;
        }
        return current - 1;
      });
    }, 1000);
  }

  function clearAcceptUndo() {
    clearAcceptUndoTimers();
    setAcceptUndo(null);
    setAcceptUndoCountdown(null);
  }

  const canMoney = canViewFinance(session ?? { role: '' });
  const canCreate = can(session, 'stock:create');
  const canEdit = can(session, 'stock:edit');

  const filtered = useMemo(() => {
    const lots = overview?.lots ?? [];
    return filterRows(lots, query, filters, {
      quantityKg: (lot) => lot.qty_kg,
      match: (lot, activeFilters) => {
        if (activeFilters.godown && lot.godown_name !== activeFilters.godown) return false;
        if (activeFilters.item && lot.item_name !== activeFilters.item) return false;
        return true;
      },
    });
  }, [overview, query, filters]);

  const pageData = useMemo(() => paginate(filtered, page), [filtered, page]);
  const stockGroups = useMemo(
    () => groupLotsForDisplay(filtered.map((lot) => ({
      id: lot.id,
      code: lot.code,
      item_id: lot.item_id,
      item_name: lot.item_name,
      qty_kg: lot.qty_kg,
      godown_name: lot.godown_name,
      sauda_id: lot.sauda_id,
      sauda_code: lot.sauda_code,
      gate_token_no: lot.gate_token_no,
    }))),
    [filtered],
  );
  const godownOptions = useMemo(() => uniqueValues(overview?.lots ?? [], (lot) => lot.godown_name), [overview]);
  const itemOptions = useMemo(() => uniqueValues(overview?.lots ?? [], (lot) => lot.item_name), [overview]);

  const saudaById = useMemo(
    () => new Map((overview?.saudas ?? []).map((sauda) => [sauda.id, sauda])),
    [overview?.saudas],
  );
  const eligibleSaudas = useMemo(
    () => (overview?.saudas ?? []).filter(saudaIsOpenForStock),
    [overview?.saudas],
  );
  const filteredEligibleSaudas = useMemo(() => {
    const filtered = eligibleSaudas.filter((sauda) => saudaMatchesQuery(sauda, newForm.saudaQuery));
    if (newForm.sauda_id && !filtered.some((sauda) => sauda.id === newForm.sauda_id)) {
      const selected = saudaById.get(newForm.sauda_id);
      if (selected) return [selected, ...filtered];
    }
    return filtered;
  }, [eligibleSaudas, newForm.saudaQuery, newForm.sauda_id, saudaById]);
  const selectedNewSauda = newForm.sauda_id ? saudaById.get(newForm.sauda_id) ?? null : null;
  const newFormQtyKg = Number(newForm.quantity) > 0 ? Number(newForm.quantity) * 100 : 0;
  const derivedSaudaValuePaise = selectedNewSauda && newFormQtyKg > 0
    ? proRatedSaudaValuePaise(selectedNewSauda, newFormQtyKg)
    : 0;

  const intakeByGate = useMemo(
    () => intakeLinesByGate(overview?.gate_intake_lines ?? []),
    [overview?.gate_intake_lines],
  );

  const pending = overview?.pending_receipts ?? [];
  const rejected = overview?.rejected_receipts ?? [];
  const shownReceipts = receiptsExpanded ? pending : pending.slice(0, 1);
  const shownRejected = rejectedExpanded ? rejected : rejected.slice(0, 3);

  const columns = useMemo(
    () => withEditModeColumns([
      { id: 'lot', label: 'Lot' },
      { id: 'godown', label: 'Godown' },
      { id: 'item', label: 'Item' },
      { id: 'qty', label: 'Qty' },
      { id: 'moisture', label: 'Moisture' },
      { id: 'date', label: 'In date' },
      ...(canMoney ? [{ id: 'value', label: 'Value' }] : []),
      { id: 'note', label: 'Note' },
    ], tableEdit.editMode, { canEdit }),
    [canMoney, canEdit, tableEdit.editMode],
  );

  function closeEdit() {
    if (saving) return;
    setEditing(null);
    setEditForm(null);
  }

  function startEdit(lot: Lot) {
    setError(null);
    setShowNew(false);
    setEditing(lot);
    setEditForm(initialEditForm(lot));
    setSplitChildKg('');
    setSplitChildBags('');
    setSplitNote('');
  }

  async function splitForProcessing() {
    if (!editing) return;
    const item = overview?.items.find((entry) => entry.id === editing.item_id);
    if (!item || !itemUsesVariableBags(item.tracking_mode)) return;
    const childKg = Math.round(Number(splitChildKg));
    const childBags = Math.round(Number(splitChildBags));
    if (!Number.isInteger(childKg) || childKg <= 0 || childKg >= (editing.qty_kg ?? 0)) {
      setError('Enter a measured child weight less than the lot remaining weight.');
      return;
    }
    if (!Number.isInteger(childBags) || childBags <= 0) {
      setError('Enter a positive whole child bag count.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await splitLot(editing.id, {
        child_kg: childKg,
        child_bag_count: childBags,
        note: splitNote.trim() || 'Split for processing',
      });
      closeEdit();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not split lot');
    } finally {
      setSaving(false);
    }
  }

  function clearFilters() {
    setQuery('');
    setFilters({});
    setPage(0);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing || !editForm) return;
    const quantityValue = Number(editForm.quantity);
    const moisture = editForm.moisture === '' ? null : Number(editForm.moisture);
    const valuePaise = editForm.value === '' ? undefined : Math.round(Number(editForm.value) * 100);
    if (
      !Number.isFinite(quantityValue) ||
      quantityValue <= 0 ||
      (moisture != null && (!Number.isFinite(moisture) || moisture < 0 || moisture > 100)) ||
      (valuePaise != null && (!Number.isFinite(valuePaise) || valuePaise < 0))
    ) {
      setError('Enter a positive quantity, a moisture value from 0–100, and a non-negative value.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(
        `/api/lots/${editing.id}`,
        json('PATCH', {
          quantity: quantityValue,
          unit: editForm.unit,
          godown_id: editForm.godown_id,
          moisture_pct: moisture,
          ...(valuePaise == null ? {} : { value_paise: valuePaise }),
          note: editForm.note,
        }),
      );
      setEditing(null);
      setEditForm(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update stock lot');
    } finally {
      setSaving(false);
    }
  }

  async function createLot(event: FormEvent) {
    event.preventDefault();
    const quantityValue = Number(newForm.quantity);
    const moisture = newForm.moisture === '' ? null : Number(newForm.moisture);
    if (
      !newForm.godown_id ||
      !Number.isFinite(quantityValue) ||
      quantityValue <= 0 ||
      (moisture != null && (!Number.isFinite(moisture) || moisture < 0 || moisture > 100))
    ) {
      setError('Choose a godown and enter a positive quantity in quintals.');
      return;
    }

    const selectedSauda = newForm.mode === 'sauda' ? selectedNewSauda : null;
    if (newForm.mode === 'sauda') {
      if (!selectedSauda) {
        setError('Select a purchase sauda.');
        return;
      }
    } else if (!newForm.item_id) {
      setError('Choose an item for this manual lot.');
      return;
    }

    const qtyKg = Math.round(quantityValue * 100);
    const valuePaise = newForm.mode === 'sauda'
      ? derivedSaudaValuePaise
      : (newForm.value === '' ? 0 : Math.round(Number(newForm.value) * 100));
    if (newForm.mode === 'manual' && (!Number.isFinite(valuePaise) || valuePaise < 0)) {
      setError('Enter a non-negative value.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await api<{ warning?: boolean }>(
        '/api/lots',
        json('POST', {
          godown_id: newForm.godown_id,
          item_id: newForm.mode === 'sauda' ? selectedSauda!.item_id : newForm.item_id,
          sauda_id: newForm.mode === 'sauda' ? selectedSauda!.id : undefined,
          quantity: quantityValue,
          unit: 'QUINTAL',
          qty_kg: qtyKg,
          moisture_pct: moisture,
          value_paise: valuePaise,
          note: newForm.note || null,
        }),
      );
      setShowNew(false);
      setNewForm(emptyNewForm(overview?.godowns[0]?.id ?? ''));
      await load();
      if (result.warning) setError('Lot saved, but this receipt exceeds the sauda tolerance.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create stock lot');
    } finally {
      setSaving(false);
    }
  }

  async function acceptReceipt(receipt: Receipt) {
    const godownId = receiptGodowns[receipt.id];
    if (!godownId) {
      setError('Choose a godown before accepting.');
      return;
    }
    const remainingKg = stockReceiptRemainingKg(receipt);
    const bagInfo = stockReceiptBagInfo(receipt, overview?.items ?? []);
    setSaving(true);
    setError(null);
    try {
      const created = await api<{ id: string; code: string }>(
        '/api/lots',
        json('POST', {
          gate_entry_id: receipt.id,
          godown_id: godownId,
          item_id: receipt.item_id || null,
          qty_kg: remainingKg,
          ...(bagInfo?.usesVariableBags && bagInfo.remainingBags != null
            ? { bag_count: bagInfo.remainingBags, weight_source: 'WEIGHED' }
            : bagInfo?.usesFixedBags
              ? { quantity: bagInfo.remainingBags, unit: 'BAG' }
              : {}),
          moisture_pct: receipt.moisture_pct ?? null,
          value_paise: receiptProRatedValuePaise(receipt, remainingKg),
        }),
      );
      scheduleAcceptUndo({
        lotId: created.id,
        lotCode: created.code,
        tokenNo: receipt.token_no,
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not accept truck into stock');
    } finally {
      setSaving(false);
    }
  }

  async function undoAccept() {
    if (!acceptUndo) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/lots/${acceptUndo.lotId}/undo-accept`, json('POST', {}));
      clearAcceptUndo();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not undo truck accept');
    } finally {
      setSaving(false);
    }
  }

  function openSettlement(receipt: Receipt) {
    setError(null);
    setSettlementReceipt(receipt);
  }

  async function reopenReceipt(receiptId: string) {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/stock-receipts/${receiptId}/reopen`, json('POST', {}));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not restore rejected truck');
    } finally {
      setSaving(false);
    }
  }

  if (session === undefined) return <main className="auth-page"><p className="muted">Loading stock…</p></main>;
  if (!session) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Sign in required</h1>
          {error || sessionError ? <p className="error">{error ?? sessionError}</p> : null}
          <AppLink className="primary" href="/app">Go to login</AppLink>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <AppHeader session={session} />
      <section className="workspace">
        <PageHeader
          title="Stock & Lots"
          subtitle="Live godown-wise inventory"
          date={headerMeta.date}
          season={headerMeta.season}
          actions={
            <TableEditModeButton
              enabled={canEdit}
              editMode={tableEdit.editMode}
              onToggle={tableEdit.toggleEditMode}
            />
          }
        />

        {error && <Alert title="Action failed" level="red">{error}</Alert>}

        {acceptUndo && acceptUndoCountdown != null ? (
          <article className="stock-accept-undo" aria-live="polite">
            <p className="stock-accept-undo-copy">
              <strong>{acceptUndo.lotCode}</strong>
              {acceptUndo.tokenNo ? ` from truck ${acceptUndo.tokenNo}` : ''} added to stock.
            </p>
            {canCreate ? (
              <Button type="button" className="quiet stock-accept-undo-btn" disabled={saving} onClick={() => void undoAccept()}>
                Undo {acceptUndoCountdown}
              </Button>
            ) : null}
          </article>
        ) : null}

        <div className="stock-godown-grid">
          {(overview?.godowns ?? []).map((godown) => {
            const stockKg = godown.stock_kg ?? 0;
            const capacityKg = godown.capacity_kg ?? 0;
            const { fill, tone } = godownFill(stockKg, capacityKg);
            const barColor = tone === 'danger' ? 'var(--red)' : tone === 'warning' ? 'var(--gold-dark)' : 'var(--green)';
            return (
              <AppLink
                key={godown.id}
                href={`/app/stock/godown?id=${godown.id}`}
                className="metric stock-godown-card stock-godown-card--link"
                aria-label={`Open ${godown.name} details`}
              >
                <div className="stock-godown-head">
                  <strong>{godown.name}</strong>
                  <Badge tone={tone}>{fill}% full</Badge>
                </div>
                <div className="stock-godown-qty">{formatQtl(stockKg)}</div>
                <div className="stock-godown-cap">
                  {capacityKg > 0 ? `of ${formatQtl(capacityKg)} compatible capacity` : 'Capacity utilisation unavailable for this unit'}
                </div>
                <div className="gd-fill" aria-hidden="true">
                  <span style={{ width: `${fill}%`, background: barColor }} />
                </div>
              </AppLink>
            );
          })}
        </div>

        <div className={`${rejected.length && rejectedOpen ? 'rejected-trucks-panel rejected-trucks-panel--open' : ''}`}>
        {pending.length ? (
          <div className="receipt-list">
            {shownReceipts.map((receipt) => {
              const bagInfo = stockReceiptBagInfo(receipt, overview?.items ?? []);
              const remainingKg = stockReceiptRemainingKg(receipt);
              return (
                <article key={receipt.id} className="receipt-toast">
                  <div className="receipt-toast-copy">
                    <p className="receipt-toast-title">
                      {receipt.stock_status === 'partial' ? 'Finish stock intake for this truck?' : 'Add incoming truck to stock?'}
                    </p>
                    <p className="receipt-toast-detail">
                      {receipt.token_no ?? 'Truck'} · {receipt.supplier_name ?? 'Supplier'} · {receipt.item_name ?? 'Item'} · {formatQtl(remainingKg || receipt.net_kg)}
                      {bagInfo ? ` · ${bagInfo.remainingBags} bag${bagInfo.remainingBags === 1 ? '' : 's'} left` : ''}
                      {receipt.moisture_pct != null ? ` · ${pct(receipt.moisture_pct)}` : ''}
                      {canMoney ? ` · stock value ${formatRupee(receiptProRatedValuePaise(receipt, remainingKg))}` : ''}
                    </p>
                    <p className="receipt-toast-hint">
                      Accept takes the full remaining truck into stock. Use Reject to split rejected bags and accepted bags at different rates.
                    </p>
                  </div>
                  <div className="receipt-toast-actions">
                    {(overview?.godowns.length ?? 0) > 0 ? (
                      <label className="receipt-godown stock-godown-picker">
                        <span>Godown</span>
                        <Select
                          value={receiptGodowns[receipt.id] ?? overview?.godowns[0]?.id ?? ''}
                          onChange={(event) => setReceiptGodowns({ ...receiptGodowns, [receipt.id]: event.target.value })}
                        >
                          {(overview?.godowns ?? []).map((godown) => (
                            <option key={godown.id} value={godown.id}>{godown.name}</option>
                          ))}
                        </Select>
                      </label>
                    ) : null}
                    {canCreate ? (
                      <Button type="button" className="quiet receipt-action" disabled={saving} onClick={() => void acceptReceipt(receipt)}>
                        Accept
                      </Button>
                    ) : null}
                    {canEdit ? (
                      <Button type="button" className="secondary receipt-action" disabled={saving} onClick={() => openSettlement(receipt)}>
                        Reject
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {pending.length > 1 ? (
              <div className={`receipt-more receipt-queue-footer${rejected.length ? ' receipt-more--split' : ''}`}>
                {rejected.length ? (
                  <Button type="button" className="quiet receipt-expand-btn rejected-trucks-toggle" onClick={() => setRejectedOpen((value) => !value)}>
                    <span>{rejectedOpen ? 'Hide rejected trucks' : `See rejected trucks (${rejected.length})`}</span>
                    <ExpandChevron expanded={rejectedOpen} />
                  </Button>
                ) : null}
                <div className="receipt-more-right">
                  <span className="hint receipt-queue-status">
                    {receiptsExpanded
                      ? `Showing all ${pending.length} trucks`
                      : `${pending.length} trucks waiting`}
                  </span>
                  <Button type="button" className="quiet receipt-expand-btn" onClick={() => setReceiptsExpanded((value) => !value)}>
                    <span>{receiptsExpanded ? 'Show less' : `Show all ${pending.length}`}</span>
                    <ExpandChevron expanded={receiptsExpanded} />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <article className="receipt-empty">
            <p className="receipt-toast-title">No pending stock receipts</p>
            <p className="receipt-toast-hint">When an incoming truck is marked Done at the gate, it will appear here for one-click accept or reject.</p>
          </article>
        )}

        {rejected.length && pending.length <= 1 ? (
          <div className="receipt-controls">
            <Button type="button" className="quiet receipt-expand-btn rejected-trucks-toggle" onClick={() => setRejectedOpen((value) => !value)}>
              <span>{rejectedOpen ? 'Hide rejected trucks' : `See rejected trucks (${rejected.length})`}</span>
              <ExpandChevron expanded={rejectedOpen} />
            </Button>
          </div>
        ) : null}

        {rejected.length && rejectedOpen ? (
            <TableCard
              title="Recently rejected trucks"
              subtitle="A rejection can be reopened for two days, then it is kept as an audit decision."
              className="rejected-receipts"
              actions={
                <AppLink href="/app/stock/rejected" className="rejected-trucks-page-link" aria-label="Open all rejected trucks">
                  →
                </AppLink>
              }
            >
              <div className="rejected-receipt-list">
                {shownRejected.map((receipt) => (
                  <div key={receipt.id} className="rejected-receipt">
                    <div>
                      <strong>{receipt.token_no ?? 'Truck'}</strong>
                      <span>
                        {receipt.supplier_name ?? 'Supplier'} · {receipt.item_name ?? 'Item'} · {formatQtl(receipt.net_kg)}
                        {canMoney ? ` · rejected value ${formatRupee(receiptProRatedValuePaise(receipt, receipt.net_kg ?? 0))}` : ''}
                      </span>
                      {receipt.stock_note ? <span className="rejected-receipt-note">{receipt.stock_note}</span> : null}
                    </div>
                    {canEdit && receipt.can_reopen ? (
                      <Button type="button" className="quiet" disabled={saving} onClick={() => void reopenReceipt(receipt.id)}>
                        Restore to stock
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
              {rejected.length > 3 ? (
                <div className="receipt-more">
                  <span className="hint">
                    {rejectedExpanded ? `Showing all ${rejected.length}` : `${rejected.length - 3} more rejected truck${rejected.length > 4 ? 's' : ''}`}
                  </span>
                  <Button type="button" className="quiet receipt-expand-btn" onClick={() => setRejectedExpanded((value) => !value)}>
                    <span>{rejectedExpanded ? 'Show less' : `Show all ${rejected.length}`}</span>
                    <ExpandChevron expanded={rejectedExpanded} />
                  </Button>
                </div>
              ) : null}
            </TableCard>
        ) : null}
        </div>

        {settlementReceipt ? (
          <StockSettlementDialog
            receipt={settlementReceipt}
            items={overview?.items ?? []}
            godowns={overview?.godowns ?? []}
            godownId={receiptGodowns[settlementReceipt.id] ?? overview?.godowns[0]?.id ?? ''}
            canViewFinance={canMoney}
            onClose={() => setSettlementReceipt(null)}
            onSaved={load}
          />
        ) : null}

        {showNew && (
          <Panel title="New lot">
            <TabRow className="screen-section-tabs" aria-label="New lot source">
              <Tab
                selected={newForm.mode === 'sauda'}
                onClick={() => setNewForm((current) => ({ ...emptyNewForm(current.godown_id), mode: 'sauda' }))}
              >
                From sauda
              </Tab>
              <Tab
                selected={newForm.mode === 'manual'}
                onClick={() => setNewForm((current) => ({ ...emptyNewForm(current.godown_id), mode: 'manual' }))}
              >
                Manual stock
              </Tab>
            </TabRow>
            <FormGrid className="ui-form-grid--compact" onSubmit={createLot}>
              {newForm.mode === 'sauda' ? (
                <>
                  <Field label="Sauda">
                    <Select
                      required
                      value={newForm.sauda_id}
                      onChange={(e) => setNewForm((current) => ({
                        ...current,
                        sauda_id: e.target.value,
                        moisture: saudaById.get(e.target.value)?.moisture_pct != null
                          ? String(saudaById.get(e.target.value)!.moisture_pct)
                          : current.moisture,
                      }))}
                      searchable
                      searchValue={newForm.saudaQuery}
                      onSearchChange={(value) => setNewForm((current) => ({ ...current, saudaQuery: value }))}
                      searchPlaceholder="Search by code, party, or item…"
                      emptyMessage={newForm.saudaQuery.trim() ? 'No saudas match this search' : 'No open purchase saudas'}
                    >
                      <option value="">Select sauda</option>
                      {filteredEligibleSaudas.map((sauda) => (
                        <option key={sauda.id} value={sauda.id}>{formatSaudaCode(sauda.code, sauda.direction)}</option>
                      ))}
                    </Select>
                  </Field>
                  {selectedNewSauda ? (
                    <div className="gate-sauda-summary">
                      <dl className="gate-sauda-summary-grid">
                        <div><dt>Sauda</dt><dd>{formatSaudaCode(selectedNewSauda.code, selectedNewSauda.direction)}</dd></div>
                        <div><dt>Party</dt><dd>{selectedNewSauda.supplier_name ?? '—'}</dd></div>
                        <div><dt>Item</dt><dd>{selectedNewSauda.item_name ?? '—'}</dd></div>
                        <div><dt>Agreed</dt><dd>{qtlFromKg(selectedNewSauda.qty_kg)}</dd></div>
                        <div><dt>Delivered</dt><dd>{qtlFromKg(selectedNewSauda.fulfilled_qty_base)}</dd></div>
                        <div><dt>Remaining</dt><dd>{qtlFromKg(saudaRemainingKg(selectedNewSauda))}</dd></div>
                        {canMoney && newFormQtyKg > 0 ? (
                          <div><dt>Value</dt><dd>{formatRupee(derivedSaudaValuePaise)}</dd></div>
                        ) : null}
                      </dl>
                    </div>
                  ) : null}
                </>
              ) : (
                <Field label="Item">
                  <Select required value={newForm.item_id} onChange={(e) => setNewForm({ ...newForm, item_id: e.target.value })}>
                    <option value="">Choose item</option>
                    {(overview?.items ?? []).map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Godown">
                <Select required value={newForm.godown_id} onChange={(e) => setNewForm({ ...newForm, godown_id: e.target.value })}>
                  <option value="">Choose godown</option>
                  {(overview?.godowns ?? []).map((godown) => (
                    <option key={godown.id} value={godown.id}>{godown.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Quantity (qtl)">
                <Input required type="number" min="0.001" step="0.001" value={newForm.quantity} onChange={(e) => setNewForm({ ...newForm, quantity: e.target.value })} />
              </Field>
              <Field label="Moisture %">
                <Input type="number" min="0" max="100" step="0.1" value={newForm.moisture} onChange={(e) => setNewForm({ ...newForm, moisture: e.target.value })} />
              </Field>
              {canMoney && newForm.mode === 'manual' ? (
                <Field label="Value ₹">
                  <Input type="number" min="0" step="1" value={newForm.value} onChange={(e) => setNewForm({ ...newForm, value: e.target.value })} />
                </Field>
              ) : null}
              {canMoney && newForm.mode === 'sauda' && selectedNewSauda && newFormQtyKg > 0 ? (
                <Field label="Value ₹">
                  <p className="muted">{formatRupee(derivedSaudaValuePaise)} pro-rated from sauda rate</p>
                </Field>
              ) : null}
              <Field label="Note">
                <Textarea value={newForm.note} onChange={(e) => setNewForm({ ...newForm, note: e.target.value })} />
              </Field>
              <FormActions>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create lot'}</Button>
                <Button className="secondary" type="button" onClick={() => setShowNew(false)}>Cancel</Button>
              </FormActions>
            </FormGrid>
          </Panel>
        )}

        <dialog
          ref={editDialogRef}
          className="app-dialog stock-edit-dialog"
          onClose={() => {
            if (!saving) closeEdit();
          }}
          onCancel={(event) => {
            event.preventDefault();
            closeEdit();
          }}
        >
          {editing && editForm ? (
            <>
              <div className="app-dialog-head">
                <div>
                  <h2>Edit {editing.code}</h2>
                  <p>
                    <strong>{editing.item_name ?? 'Item'}</strong>
                    {editing.godown_name ? ` · ${editing.godown_name}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="app-dialog-close ms-focus-ring"
                  aria-label="Close edit lot dialog"
                  onClick={closeEdit}
                  disabled={saving}
                >
                  ×
                </button>
              </div>
              <FormGrid className="ui-form-grid--compact stock-edit-dialog-form" onSubmit={saveEdit}>
                <Field label="Quantity">
                  <Input required type="number" min="0.001" step="0.001" value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} />
                </Field>
                <Field label="Unit">
                  <Select value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}>
                    <option>KG</option>
                    <option>QUINTAL</option>
                    <option>TONNE</option>
                  </Select>
                </Field>
                <div className="stock-godown-picker">
                  <Field label="Godown">
                    <Select value={editForm.godown_id} onChange={(e) => setEditForm({ ...editForm, godown_id: e.target.value })}>
                      <option value="">Not specified</option>
                      {(overview?.godowns ?? []).map((godown) => (
                        <option key={godown.id} value={godown.id}>{godown.name}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Moisture %">
                  <Input type="number" min="0" max="100" step="0.1" value={editForm.moisture} onChange={(e) => setEditForm({ ...editForm, moisture: e.target.value })} />
                </Field>
                {canMoney ? (
                  <Field label="Value ₹">
                    <Input type="number" min="0" step="0.01" value={editForm.value} onChange={(e) => setEditForm({ ...editForm, value: e.target.value })} />
                  </Field>
                ) : null}
                <Field label="Note">
                  <Textarea value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} />
                </Field>
                {(() => {
                  const item = overview?.items.find((entry) => entry.id === editing.item_id);
                  if (!item || !itemUsesVariableBags(item.tracking_mode)) return null;
                  return (
                    <div className="full-width stock-split-panel">
                      <h3>Split for processing</h3>
                      <p className="muted">Need only part of this lot? Split and weigh that portion first.</p>
                      <p className="muted">
                        {formatDualQuantity({
                          weightKg: editing.qty_kg ?? 0,
                          bagCount: editing.bag_count,
                          trackingMode: 'VARIABLE_BAG',
                        })}
                      </p>
                      <FormGrid className="ui-form-grid--compact">
                        <Field label="Measured child weight (kg)">
                          <Input inputMode="numeric" value={splitChildKg} onChange={(e) => setSplitChildKg(e.target.value)} />
                        </Field>
                        <Field label="Child bag count">
                          <Input inputMode="numeric" value={splitChildBags} onChange={(e) => setSplitChildBags(e.target.value)} />
                        </Field>
                        <Field label="Reason / note">
                          <Input value={splitNote} onChange={(e) => setSplitNote(e.target.value)} />
                        </Field>
                        <FormActions>
                          <Button type="button" className="secondary" disabled={saving} onClick={() => void splitForProcessing()}>
                            Split weighed portion
                          </Button>
                        </FormActions>
                      </FormGrid>
                    </div>
                  );
                })()}
                <FormActions className="stock-edit-dialog-actions">
                  <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
                  <Button className="secondary" type="button" onClick={closeEdit} disabled={saving}>Cancel</Button>
                </FormActions>
              </FormGrid>
            </>
          ) : null}
        </dialog>

        <TableCard
          title="Lots on hand"
          subtitle={`${filtered.length} lot${filtered.length === 1 ? '' : 's'}`}
          actions={
            canCreate ? (
              <Button type="button" onClick={() => { setShowNew(true); setEditing(null); setEditForm(null); }}>
                + New lot
              </Button>
            ) : null
          }
        >
          <TableFilters
            compact
            onClear={clearFilters}
            clearDisabled={!query && !Object.keys(filters).length}
          >
            <FilterSearch value={query} onChange={(value) => { setQuery(value); setPage(0); }} placeholder="Search lots…" aria-label="Search lots" />
            <Select
              className="table-filter"
              aria-label="Filter by godown"
              value={filters.godown ?? ''}
              onChange={(e) => { setFilters({ ...filters, godown: e.target.value }); setPage(0); }}
            >
              <option value="">All godowns</option>
              {godownOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
            <Select
              className="table-filter"
              aria-label="Filter by material"
              value={filters.item ?? ''}
              onChange={(e) => { setFilters({ ...filters, item: e.target.value }); setPage(0); }}
            >
              <option value="">All materials</option>
              {itemOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
            <RangeField
              label="Qty qtl"
              min={filters.min_qty ?? ''}
              max={filters.max_qty ?? ''}
              onMinChange={(value) => { setFilters({ ...filters, min_qty: value }); setPage(0); }}
              onMaxChange={(value) => { setFilters({ ...filters, max_qty: value }); setPage(0); }}
            />
          </TableFilters>

          <DataTable columns={columns}>
            {pageData.rows.length ? pageData.rows.map((lot) => (
              <tr key={lot.id} className={acceptUndo?.lotId === lot.id ? 'stock-lot-row--just-accepted' : undefined}>
                {tableEdit.editMode && canEdit && (
                  <TableEditCell label={lot.code} onClick={() => startEdit(lot)} />
                )}
                <td>
                  <strong className="dashboard-token">{lot.code}</strong>
                  {acceptUndo?.lotId === lot.id && acceptUndoCountdown != null && canCreate ? (
                    <Button
                      type="button"
                      className="quiet stock-lot-undo-btn"
                      disabled={saving}
                      onClick={() => void undoAccept()}
                    >
                      Undo {acceptUndoCountdown}
                    </Button>
                  ) : null}
                </td>
                <td>{lot.godown_name ?? '—'}</td>
                <td>{lot.item_name ?? '—'}</td>
                <td><strong>{formatQtl(lot.qty_kg)}</strong></td>
                <td>{pct(lot.moisture_pct)}</td>
                <td className="muted">{lot.in_date ? formatDate(lot.in_date) : '—'}</td>
                {canMoney ? (
                  <td>
                    <LotValueCell lot={lot} intakeByGate={intakeByGate} />
                  </td>
                ) : null}
                <td className="table-note-col"><TableClampedText text={lot.note} /></td>
              </tr>
            )) : (
              <tr>
                <td colSpan={columns.length}><EmptyState>No lots on hand.</EmptyState></td>
              </tr>
            )}
          </DataTable>

          <TablePager
            total={pageData.total}
            index={pageData.index}
            pageSize={PAGE_SIZE}
            onPrevious={() => setPage((value) => Math.max(0, value - 1))}
            onNext={() => setPage((value) => value + 1)}
          />
        </TableCard>

        <Panel title="Inventory by purchase & material" className="stock-group-panel">
          <p className="muted">Grouped stock for processing selection. Expand a group to see godown-wise lots.</p>
          {stockGroups.length ? stockGroups.map((group) => (
            <details key={group.group_key} className="stock-group-card">
              <summary>
                {group.item_name}
                {group.sauda_code ? ` · ${group.sauda_code}` : ' · Unlinked stock'}
                {' · '}{formatQtl(group.total_qty_kg)} total
              </summary>
              <div className="stock-group-lots">
                {group.lots.map((lot) => (
                  <div key={lot.id} className="line">
                    <span>
                      <strong>{lot.code}</strong>
                      {' · '}{lot.godown_name ?? 'No godown'}
                      {' · '}{formatQtl(lot.qty_kg)}
                      {lot.gate_token_no ? ` · truck ${lot.gate_token_no}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )) : <EmptyState>No grouped stock in this view.</EmptyState>}
        </Panel>

        {overview && <StockLedger items={overview.items} />}
      </section>
    </main>
  );
}
