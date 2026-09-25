'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Field, Input, Select, Textarea } from './ui';
import { formatQtl, formatRupee } from '../lib/format';
import { stockReceiptBagInfo, stockReceiptRemainingKg } from '../lib/stock-receipts';
import {
  emptySettlementLine,
  receiptDefaultRatePaise,
  settlementLinesToPayload,
  settlementRemainingBags,
  settlementRemainingQtl,
  settlementUsesBags,
  summarizeSettlementLines,
  validateSettlementLines,
  type SettlementLineDraft,
} from '../lib/stock-settlement';
import { api, json } from '../lib/api';

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
  sauda_rate_paise_per_qtl?: number;
  gate_rate_paise_per_qtl?: number;
};

type Item = {
  id: string;
  tracking_mode?: string | null;
  package_unit?: string | null;
  package_quantity_base?: number | null;
};

type Godown = { id: string; name: string };

export function StockSettlementDialog({
  receipt,
  items,
  godowns,
  godownId,
  canViewFinance,
  onClose,
  onSaved,
}: {
  receipt: Receipt;
  items: Item[];
  godowns: Godown[];
  godownId: string;
  canViewFinance: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [lines, setLines] = useState<SettlementLineDraft[]>(() => [emptySettlementLine('REJECTED')]);
  const [selectedGodownId, setSelectedGodownId] = useState(godownId);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const usesBags = settlementUsesBags(receipt, items);
  const bagInfo = stockReceiptBagInfo(receipt, items);
  const remainingBags = settlementRemainingBags(receipt, items);
  const remainingQtl = settlementRemainingQtl(receipt);
  const defaultRateInr = (receiptDefaultRatePaise(receipt) / 100).toString();
  const remainingTotal = usesBags ? remainingBags : remainingQtl;

  const summary = useMemo(() => {
    const base = summarizeSettlementLines(lines, usesBags);
    return { ...base, remaining: Math.max(0, remainingTotal - base.allocated) };
  }, [lines, remainingTotal, usesBags]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }, []);

  function updateLine(id: string, patch: Partial<SettlementLineDraft>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function addLine(outcome: SettlementLineDraft['outcome'] = 'REJECTED') {
    setLines((current) => [...current, {
      ...emptySettlementLine(outcome),
      rate_inr: outcome === 'ACCEPTED' ? defaultRateInr : '',
    }]);
  }

  function removeLine(id: string) {
    setLines((current) => (current.length <= 1 ? current : current.filter((line) => line.id !== id)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const validationError = validateSettlementLines(lines, usesBags, remainingTotal);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!selectedGodownId) {
      setError('Choose a godown for accepted stock.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/api/stock-receipts/${receipt.id}/settle`, json('POST', {
        godown_id: selectedGodownId,
        lines: settlementLinesToPayload(lines, usesBags),
      }));
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save truck settlement');
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog stock-settlement-dialog"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="app-dialog-head">
          <div>
            <h2>Settle truck intake</h2>
            <p>
              <strong>{receipt.token_no ?? 'Truck'}</strong>
              {' · '}{receipt.supplier_name ?? 'Supplier'}
              {' · '}{receipt.item_name ?? 'Item'}
              {' · '}{formatQtl(stockReceiptRemainingKg(receipt) || receipt.net_kg)}
              {usesBags ? ` · ${remainingBags} bag${remainingBags === 1 ? '' : 's'} left` : ` · ${remainingQtl.toFixed(2)} qtl left`}
            </p>
          </div>
          <button
            type="button"
            className="app-dialog-close ms-focus-ring"
            aria-label="Close settlement dialog"
            onClick={onClose}
            disabled={saving}
          >
            ×
          </button>
        </div>

        {error ? <p className="error app-dialog-error">{error}</p> : null}

        <p className="muted stock-settlement-hint">
          Split the remaining truck into rejected bags and accepted bags at negotiated rates. All {usesBags ? 'bags' : 'quantity'} must be allocated before saving.
        </p>

        <div className="stock-settlement-toolbar">
          <Field label="Godown for accepted stock">
            <Select
              value={selectedGodownId}
              onChange={(event) => setSelectedGodownId(event.target.value)}
              disabled={saving || !godowns.length}
            >
              {godowns.map((godown) => (
                <option key={godown.id} value={godown.id}>{godown.name}</option>
              ))}
            </Select>
          </Field>
          {canViewFinance ? (
            <p className="muted stock-settlement-default-rate">
              Agreed rate: {formatRupee(receiptDefaultRatePaise(receipt))}/qtl
              {usesBags && bagInfo?.averageKgPerBag ? ` · ${formatRupee(Math.round(receiptDefaultRatePaise(receipt) * bagInfo.averageKgPerBag / 100))}/bag est.` : ''}
            </p>
          ) : null}
        </div>

        <div className="stock-settlement-lines">
          {lines.map((line, index) => (
            <div key={line.id} className="stock-settlement-line">
              <div className="stock-settlement-line-head">
                <strong>Line {index + 1}</strong>
                {lines.length > 1 ? (
                  <button type="button" className="quiet-link" onClick={() => removeLine(line.id)} disabled={saving}>
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="stock-settlement-line-grid">
                <Field label="Outcome">
                  <Select
                    value={line.outcome}
                    onChange={(event) => updateLine(line.id, {
                      outcome: event.target.value as SettlementLineDraft['outcome'],
                      rate_inr: event.target.value === 'ACCEPTED' ? (line.rate_inr || defaultRateInr) : '',
                    })}
                    disabled={saving}
                  >
                    <option value="REJECTED">Do not accept</option>
                    <option value="ACCEPTED">Accept at rate</option>
                  </Select>
                </Field>
                <Field label={usesBags ? 'Bags' : 'Quantity (qtl)'}>
                  <Input
                    type="number"
                    min="1"
                    step={usesBags ? '1' : '0.001'}
                    required
                    value={usesBags ? line.bags : line.quantity_qtl}
                    onChange={(event) => updateLine(line.id, usesBags
                      ? { bags: event.target.value }
                      : { quantity_qtl: event.target.value })}
                    disabled={saving}
                  />
                </Field>
                {line.outcome === 'ACCEPTED' ? (
                  <Field label={usesBags ? 'Rate ₹ / bag' : 'Rate ₹ / qtl'}>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={line.rate_inr}
                      onChange={(event) => updateLine(line.id, { rate_inr: event.target.value })}
                      disabled={saving}
                    />
                  </Field>
                ) : (
                  <div className="stock-settlement-line-spacer" aria-hidden="true" />
                )}
                <Field label="Reason">
                  <Textarea
                    value={line.reason}
                    onChange={(event) => updateLine(line.id, { reason: event.target.value })}
                    disabled={saving}
                    placeholder={line.outcome === 'REJECTED' ? 'Poor quality, moisture, damage…' : 'Lower grade, negotiated rate…'}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>

        <div className="stock-settlement-actions-row">
          <Button type="button" className="secondary" onClick={() => addLine('REJECTED')} disabled={saving}>
            + Reject line
          </Button>
          <Button type="button" className="secondary" onClick={() => addLine('ACCEPTED')} disabled={saving}>
            + Accept at rate
          </Button>
        </div>

        <div className="stock-settlement-summary" aria-live="polite">
          <span>{summary.rejected} {usesBags ? 'bag' : 'qtl'}{summary.rejected === 1 ? '' : 's'} not accepted</span>
          <span>{summary.accepted} {usesBags ? 'bag' : 'qtl'}{summary.accepted === 1 ? '' : 's'} into stock</span>
          {canViewFinance ? <span>Payable {formatRupee(summary.payablePaise)}</span> : null}
          <span className={summary.remaining === 0 ? 'ok' : 'warn'}>
            {summary.remaining === 0
              ? 'Fully allocated'
              : `${summary.remaining} ${usesBags ? 'bag' : 'qtl'} still unallocated`}
          </span>
        </div>

        <div className="app-dialog-actions">
          <Button type="submit" disabled={saving || summary.remaining !== 0}>
            {saving ? 'Saving…' : 'Save settlement'}
          </Button>
          <Button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        </div>
      </form>
    </dialog>
  );
}
