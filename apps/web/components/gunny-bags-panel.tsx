'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  FormActions,
  FormGrid,
  Input,
  Panel,
  Select,
  TableCard,
} from './ui';
import { api, json } from '../lib/api';
import { formatDate } from '../lib/format';
import { GUNNY_REASON_DIRECTION, resolveGunnyMovement, type GunnyReason } from '../../../shared/mill-intelligence';
import { formatVehicleNumber } from '../../../shared/vehicle-number';
import type { GunnyOverview } from '../lib/mill-intelligence';

const GUNNY_REASON_OPTIONS: Array<{ value: GunnyReason; label: string; hint?: string }> = [
  { value: 'RECEIVED', label: 'Received (IN)' },
  { value: 'RETURNED', label: 'Returned (IN)' },
  { value: 'ISSUED', label: 'Issued (OUT)' },
  { value: 'DAMAGED', label: 'Damaged (OUT)' },
  { value: 'MISSING', label: 'Missing (OUT)' },
  { value: 'ADJUSTMENT', label: 'Adjustment (choose direction)' },
];

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <section className="ui-card metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

export function GunnyBagsPanel({
  data,
  canCreate,
  onSaved,
  compactIntro = false,
}: {
  data: GunnyOverview;
  canCreate: boolean;
  onSaved: () => Promise<void>;
  compactIntro?: boolean;
}) {
  const [bagType, setBagType] = useState('JUTE');
  const [capacityKg, setCapacityKg] = useState('');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [reason, setReason] = useState<GunnyReason>('RECEIVED');
  const [bagCount, setBagCount] = useState('');
  const [movementDate, setMovementDate] = useState(new Date().toISOString().slice(0, 10));
  const [gateEntryId, setGateEntryId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const directionLocked = GUNNY_REASON_DIRECTION[reason] !== 'EITHER';

  useEffect(() => {
    const resolved = resolveGunnyMovement(reason);
    if (resolved.ok) setDirection(resolved.direction);
  }, [reason]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api('/api/mill-intelligence/gunny-bag-movements', json('POST', {
        bag_type: bagType,
        capacity_kg: capacityKg ? Number(capacityKg) : null,
        direction,
        reason,
        bag_count: Number(bagCount),
        movement_date: movementDate,
        gate_entry_id: gateEntryId || null,
        note: note || null,
      }));
      setBagCount('');
      setNote('');
      setCapacityKg('');
      setGateEntryId('');
      await onSaved();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not save movement');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Panel title="Physical bag balance">
        {!compactIntro ? (
          <p className="muted" style={{ marginBottom: 12 }}>
            Operational gunny reconciliation only — not rice stock or financial inventory. Damaged and missing bags are always recorded as OUT so the physical balance decreases.
          </p>
        ) : (
          <p className="muted" style={{ marginBottom: 12 }}>
            Count empty and full gunny bags at the gate. This does not change rice stock.
          </p>
        )}
        {data.balances.length === 0 ? (
          <EmptyState>No gunny movements recorded yet.</EmptyState>
        ) : (
          <div className="kpi-grid dashboard-kpis">
            {data.balances.map((row) => (
              <Metric
                key={`${row.bag_type}-${row.capacity_kg ?? 'any'}`}
                label={`${row.bag_type}${row.capacity_kg ? ` · ${row.capacity_kg} kg` : ''}`}
                value={`${row.balance.toLocaleString('en-IN')} bags`}
              />
            ))}
          </div>
        )}
      </Panel>

      {canCreate ? (
        <Panel title="Record bag movement">
          {formError ? <Alert title="Could not save movement" level="red">{formError}</Alert> : null}
          <FormGrid onSubmit={(event) => void submit(event)}>
            <Field label="Reason">
              <Select value={reason} onChange={(e) => setReason(e.target.value as GunnyReason)} disabled={saving}>
                {GUNNY_REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Direction">
              <Select value={direction} onChange={(e) => setDirection(e.target.value as 'IN' | 'OUT')} disabled={saving || directionLocked}>
                <option value="IN">IN · balance increases</option>
                <option value="OUT">OUT · balance decreases</option>
              </Select>
            </Field>
            <Field label="Bag type">
              <Select value={bagType} onChange={(e) => setBagType(e.target.value)} disabled={saving}>
                <option value="JUTE">Jute</option>
                <option value="PP">PP</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
            <Field label="Capacity (kg, optional)">
              <Input type="number" min="1" step="1" placeholder="40 / 50" value={capacityKg} onChange={(e) => setCapacityKg(e.target.value)} disabled={saving} />
            </Field>
            <Field label="Bag count">
              <Input type="number" min="1" step="1" required value={bagCount} onChange={(e) => setBagCount(e.target.value)} disabled={saving} />
            </Field>
            <Field label="Movement date">
              <Input type="date" required value={movementDate} onChange={(e) => setMovementDate(e.target.value)} disabled={saving} />
            </Field>
            <Field label="Linked gate entry (optional)">
              <Select value={gateEntryId} onChange={(e) => setGateEntryId(e.target.value)} disabled={saving}>
                <option value="">None</option>
                {data.gate_entries.map((gate) => (
                  <option key={gate.id} value={gate.id}>{gate.token_no ?? gate.id} · {formatVehicleNumber(gate.vehicle_no)} · {gate.entry_date ? formatDate(gate.entry_date) : ''}</option>
                ))}
              </Select>
            </Field>
            <Field label="Note">
              <Input value={note} onChange={(e) => setNote(e.target.value)} disabled={saving} />
            </Field>
            <FormActions>
              <Button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save movement'}</Button>
            </FormActions>
          </FormGrid>
        </Panel>
      ) : (
        <Alert title="Read-only" level="blue">You can view gunny balances but need gate:create to record movements.</Alert>
      )}

      <TableCard title="Recent movements" subtitle="Count-based reconciliation — individual bag serial numbers are not tracked in this beta.">
        {data.movements.length === 0 ? (
          <EmptyState>No movements yet.</EmptyState>
        ) : (
          <DataTable columns={[
            { id: 'date', label: 'Date' },
            { id: 'type', label: 'Type' },
            { id: 'capacity', label: 'Capacity' },
            { id: 'direction', label: 'Direction' },
            { id: 'reason', label: 'Reason' },
            { id: 'count', label: 'Count' },
            { id: 'gate', label: 'Gate' },
            { id: 'note', label: 'Note' },
          ]}>
            {data.movements.map((row) => (
              <tr key={String(row.id)}>
                <td>{formatDate(String(row.movement_date))}</td>
                <td>{String(row.bag_type)}</td>
                <td>{row.capacity_kg ? `${row.capacity_kg} kg` : '—'}</td>
                <td><Badge tone={row.direction === 'IN' ? 'success' : 'warning'}>{String(row.direction)}</Badge></td>
                <td>{String(row.reason)}</td>
                <td>{Number(row.bag_count).toLocaleString('en-IN')}</td>
                <td>{String(row.gate_token_no ?? '—')}</td>
                <td>{String(row.note ?? '—')}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </TableCard>
    </>
  );
}
