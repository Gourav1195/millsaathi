'use client';

import { AppLink } from './app-link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  FormActions,
  FormGrid,
  Input,
  PageHeader,
  Panel,
  Select,
  Tab,
  TabRow,
  TableCard,
} from './ui';
import { millHeaderMeta } from '../lib/app-meta';
import { api, json } from '../lib/api';
import { formatDate, formatQtl } from '../lib/format';
import {
  fetchMillIntelligenceOverview,
  type MillIntelligenceOverview,
  type MillIntelligenceSettings,
} from '../lib/mill-intelligence';
import { can } from '../lib/permissions';
import { useSession } from '../lib/session';
import { GunnyBagsPanel } from './gunny-bags-panel';
import {
  MILL_INTELLIGENCE_SUGGESTED_DEFAULTS,
  qualityCheckWarnings,
} from '../../../shared/mill-intelligence';

type TabId = 'otr' | 'drying' | 'quality' | 'gunny';

const pct = (value: number | null | undefined, digits = 1) =>
  value == null ? '—' : `${value.toLocaleString('en-IN', { maximumFractionDigits: digits })}%`;

function localDateTimeValue(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoRecordedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small className="muted">{hint}</small> : null}
    </Card>
  );
}

function SettingsPanel({
  settings,
  open,
  onClose,
  onSaved,
}: {
  settings: MillIntelligenceSettings;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const suggested = settings.suggested ?? MILL_INTELLIGENCE_SUGGESTED_DEFAULTS;
  const [form, setForm] = useState({
    otr_target_pct: settings.otr_target_pct != null ? String(settings.otr_target_pct) : '',
    otr_alert_delta_pct: settings.otr_alert_delta_pct != null ? String(settings.otr_alert_delta_pct) : '',
    moisture_min_pct: settings.moisture_min_pct != null ? String(settings.moisture_min_pct) : '',
    moisture_max_pct: settings.moisture_max_pct != null ? String(settings.moisture_max_pct) : '',
    head_rice_min_pct: settings.head_rice_min_pct != null ? String(settings.head_rice_min_pct) : '',
    broken_rice_max_pct: settings.broken_rice_max_pct != null ? String(settings.broken_rice_max_pct) : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      otr_target_pct: settings.otr_target_pct != null ? String(settings.otr_target_pct) : '',
      otr_alert_delta_pct: settings.otr_alert_delta_pct != null ? String(settings.otr_alert_delta_pct) : '',
      moisture_min_pct: settings.moisture_min_pct != null ? String(settings.moisture_min_pct) : '',
      moisture_max_pct: settings.moisture_max_pct != null ? String(settings.moisture_max_pct) : '',
      head_rice_min_pct: settings.head_rice_min_pct != null ? String(settings.head_rice_min_pct) : '',
      broken_rice_max_pct: settings.broken_rice_max_pct != null ? String(settings.broken_rice_max_pct) : '',
    });
    setError(null);
  }, [open, settings]);

  if (!open) return null;

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api('/api/mill-intelligence/settings', json('PUT', {
        otr_target_pct: form.otr_target_pct || null,
        otr_alert_delta_pct: form.otr_alert_delta_pct || null,
        moisture_min_pct: form.moisture_min_pct || null,
        moisture_max_pct: form.moisture_max_pct || null,
        head_rice_min_pct: form.head_rice_min_pct || null,
        broken_rice_max_pct: form.broken_rice_max_pct || null,
      }));
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Target settings" actions={<Button type="button" className="quiet" onClick={onClose}>Close</Button>}>
      <p className="muted" style={{ marginBottom: 16 }}>
        Targets vary by variety, season, milling process, and mill policy. Suggested placeholders are not saved until you confirm.
      </p>
      {error ? <Alert title="Could not save settings" level="red">{error}</Alert> : null}
      <FormGrid onSubmit={(event) => void save(event)}>
        <Field label="OTR target (%)">
          <Input type="number" step="0.1" min="0" max="100" placeholder={String(suggested.otr_target_pct)} value={form.otr_target_pct} onChange={(e) => setForm((prev) => ({ ...prev, otr_target_pct: e.target.value }))} disabled={saving} />
        </Field>
        <Field label="OTR alert delta (%)">
          <Input type="number" step="0.1" min="0" max="100" placeholder={String(suggested.otr_alert_delta_pct)} value={form.otr_alert_delta_pct} onChange={(e) => setForm((prev) => ({ ...prev, otr_alert_delta_pct: e.target.value }))} disabled={saving} />
        </Field>
        <Field label="Head rice minimum (%)">
          <Input type="number" step="0.1" min="0" max="100" placeholder={String(suggested.head_rice_min_pct)} value={form.head_rice_min_pct} onChange={(e) => setForm((prev) => ({ ...prev, head_rice_min_pct: e.target.value }))} disabled={saving} />
        </Field>
        <Field label="Broken rice maximum (%)">
          <Input type="number" step="0.1" min="0" max="100" placeholder={String(suggested.broken_rice_max_pct)} value={form.broken_rice_max_pct} onChange={(e) => setForm((prev) => ({ ...prev, broken_rice_max_pct: e.target.value }))} disabled={saving} />
        </Field>
        <Field label="Moisture minimum (%)">
          <Input type="number" step="0.1" min="0" max="100" placeholder={String(suggested.moisture_min_pct)} value={form.moisture_min_pct} onChange={(e) => setForm((prev) => ({ ...prev, moisture_min_pct: e.target.value }))} disabled={saving} />
        </Field>
        <Field label="Moisture maximum (%)">
          <Input type="number" step="0.1" min="0" max="100" placeholder={String(suggested.moisture_max_pct)} value={form.moisture_max_pct} onChange={(e) => setForm((prev) => ({ ...prev, moisture_max_pct: e.target.value }))} disabled={saving} />
        </Field>
        <FormActions>
          <Button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save targets'}</Button>
        </FormActions>
      </FormGrid>
    </Panel>
  );
}

export function MillIntelligenceBetaApp() {
  const { session, sessionError } = useSession();
  const headerMeta = millHeaderMeta(session);
  const [tab, setTab] = useState<TabId>('otr');
  const [data, setData] = useState<MillIntelligenceOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const canManageSettings = can(session, 'organisation:manage');
  const canCreateDrying = can(session, 'processing:create');
  const canCreateQuality = can(session, 'processing:create');
  const canCreateGunny = can(session, 'gate:create');

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchMillIntelligenceOverview());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load Mill Intelligence');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) void reload();
  }, [session, reload]);

  const settings = data?.settings;
  const moistureRangeLabel = useMemo(() => {
    if (!settings) return 'Not configured';
    if (settings.moisture_min_pct != null && settings.moisture_max_pct != null) {
      return `${settings.moisture_min_pct}% – ${settings.moisture_max_pct}%`;
    }
    if (settings.configured) return 'Partially configured';
    return `Suggested ${settings.suggested.moisture_min_pct}% – ${settings.suggested.moisture_max_pct}% (not saved)`;
  }, [settings]);

  if (session === undefined) {
    return <main className="auth-page"><p className="muted">Loading Mill Intelligence…</p></main>;
  }
  if (!session) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Sign in required</h1>
          {sessionError ? <p className="error">{sessionError}</p> : null}
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
          title="Mill Intelligence"
          subtitle="Manual operational controls for yield, moisture, quality and gunny bags. Beta."
          date={headerMeta.date}
          season={headerMeta.season}
          actions={
            canManageSettings ? (
              <Button type="button" className="quiet" onClick={() => setSettingsOpen(true)}>Target settings</Button>
            ) : null
          }
        />

        <p className="muted" style={{ marginBottom: 16 }}>
          Enter readings from existing meters, slips and physical counts. No sensors are required.
        </p>

        {error ? <Alert title="Could not load data" level="red">{error}</Alert> : null}
        {loading && !data ? <p className="muted">Loading operational intelligence…</p> : null}

        {settings ? <SettingsPanel settings={settings} open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={reload} /> : null}

        <TabRow className="screen-section-tabs" aria-label="Mill Intelligence sections">
          <Tab selected={tab === 'otr'} onClick={() => setTab('otr')}>OTR &amp; Yield</Tab>
          <Tab selected={tab === 'drying'} onClick={() => setTab('drying')}>Drying &amp; Moisture</Tab>
          <Tab selected={tab === 'quality'} onClick={() => setTab('quality')}>Head vs Broken</Tab>
          <Tab selected={tab === 'gunny'} onClick={() => setTab('gunny')}>Gunny Bags</Tab>
        </TabRow>

        {data && tab === 'otr' ? <OtrTab data={data} /> : null}
        {data && tab === 'drying' ? (
          <DryingTab
            data={data}
            canCreate={canCreateDrying}
            moistureRangeLabel={moistureRangeLabel}
            onManageSettings={canManageSettings ? () => setSettingsOpen(true) : undefined}
            onSaved={reload}
          />
        ) : null}
        {data && tab === 'quality' ? <QualityTab data={data} canCreate={canCreateQuality} onSaved={reload} /> : null}
        {data && tab === 'gunny' ? (
          <GunnyBagsPanel data={data.gunny} canCreate={canCreateGunny} onSaved={reload} />
        ) : null}
      </section>
    </main>
  );
}

function OtrTab({ data }: { data: MillIntelligenceOverview }) {
  const { today, recent_runs: recentRuns } = data.otr;
  const targetConfigured = data.settings.otr_target_pct != null;

  return (
    <>
      <div className="kpi-grid dashboard-kpis">
        <Metric label="Today&apos;s actual OTR" value={pct(today.actual_otr_pct)} hint={`${formatQtl(today.main_output_kg)} main / ${formatQtl(today.input_kg)} input`} />
        <Metric label="Configured target" value={targetConfigured ? pct(today.target_pct) : 'Not set'} />
        <Metric label="Variance" value={today.variance_pct == null ? '—' : `${today.variance_pct >= 0 ? '+' : ''}${pct(today.variance_pct)}`} />
        <Metric label="Main output / input" value={`${formatQtl(today.main_output_kg)} / ${formatQtl(today.input_kg)}`} />
      </div>

      {!targetConfigured ? (
        <Alert title="Set an OTR target to enable alerts" level="blue">
          OTR alerts use your mill&apos;s saved target and alert delta — not a generic industry benchmark.
        </Alert>
      ) : null}
      {today.alert ? (
        <Alert title="OTR below alert threshold" level="red">
          Today&apos;s actual OTR {pct(today.actual_otr_pct)} is below your alert level for target {pct(today.target_pct)}.
        </Alert>
      ) : null}

      <TableCard title="Recent OTR events" subtitle="Standalone runs use their own input/output. Chain runs use first-step input and final-step main output. Legacy production entries fill history when no posted runs exist for that day.">
        {recentRuns.length === 0 ? (
          <EmptyState>No OTR data yet. Post production in Processing or enter legacy production to see yield here.</EmptyState>
        ) : (
          <DataTable columns={[
            { id: 'date', label: 'Date' },
            { id: 'source', label: 'Source' },
            { id: 'type', label: 'Label' },
            { id: 'shift', label: 'Shift' },
            { id: 'input', label: 'Input' },
            { id: 'output', label: 'Main output' },
            { id: 'otr', label: 'Actual OTR' },
            { id: 'target', label: 'Target' },
            { id: 'variance', label: 'Variance' },
            { id: 'status', label: 'Status' },
          ]}>
            {recentRuns.map((run) => (
              <tr key={`${run.source_type ?? 'standalone'}-${run.id}`}>
                <td>{formatDate(run.run_date)}</td>
                <td>{run.source_type === 'chain' ? 'Chain' : run.source_type === 'legacy' ? 'Legacy' : 'Standalone'}</td>
                <td>{run.process_type_name ?? '—'}</td>
                <td>{run.shift || '—'}</td>
                <td>{formatQtl(run.input_kg)}</td>
                <td>{formatQtl(run.main_output_kg)}</td>
                <td>{pct(run.actual_otr_pct)}</td>
                <td>{run.target_pct == null ? '—' : pct(run.target_pct)}</td>
                <td>{run.variance_pct == null ? '—' : `${run.variance_pct >= 0 ? '+' : ''}${pct(run.variance_pct)}`}</td>
                <td>
                  {run.alert ? <Badge tone="danger">Below alert</Badge> : run.target_pct != null ? <Badge tone="success">OK</Badge> : <Badge>—</Badge>}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </TableCard>

      {data.otr.daily.length > 0 ? (
        <TableCard title="Daily OTR trend (last 7 days)" subtitle="One OTR event per standalone run, chain run, or legacy day — intermediate chain steps are not counted separately.">
          <DataTable columns={[
            { id: 'date', label: 'Date' },
            { id: 'input', label: 'Input' },
            { id: 'output', label: 'Main output' },
            { id: 'otr', label: 'OTR' },
          ]}>
            {data.otr.daily.map((row) => (
              <tr key={row.date}>
                <td>{formatDate(row.date)}</td>
                <td>{formatQtl(row.input_kg)}</td>
                <td>{formatQtl(row.main_output_kg)}</td>
                <td>{pct(row.actual_otr_pct)}</td>
              </tr>
            ))}
          </DataTable>
        </TableCard>
      ) : null}
    </>
  );
}

function DryingTab({
  data,
  canCreate,
  moistureRangeLabel,
  onManageSettings,
  onSaved,
}: {
  data: MillIntelligenceOverview;
  canCreate: boolean;
  moistureRangeLabel: string;
  onManageSettings?: () => void;
  onSaved: () => Promise<void>;
}) {
  const [lotId, setLotId] = useState('');
  const [processRunId, setProcessRunId] = useState('');
  const [stage, setStage] = useState('INTAKE');
  const [moisturePct, setMoisturePct] = useState('');
  const [recordedAt, setRecordedAt] = useState(localDateTimeValue());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!lotId && !processRunId) {
      setFormError('Select a source lot or process run.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api('/api/mill-intelligence/drying-readings', json('POST', {
        lot_id: lotId || null,
        process_run_id: processRunId || null,
        stage,
        moisture_pct: Number(moisturePct),
        recorded_at: toIsoRecordedAt(recordedAt),
        note: note || null,
      }));
      setMoisturePct('');
      setNote('');
      setRecordedAt(localDateTimeValue());
      await onSaved();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not save reading');
    } finally {
      setSaving(false);
    }
  }

  const rangeStatusLabel: Record<string, string> = {
    below: 'Below range',
    within: 'Within range',
    above: 'Above range',
    unknown: 'No range configured',
  };
  const rangeTone: Record<string, 'danger' | 'success' | 'warning' | 'neutral'> = {
    below: 'warning',
    within: 'success',
    above: 'danger',
    unknown: 'neutral',
  };

  return (
    <>
      <Panel
        title="Acceptable moisture range"
        actions={onManageSettings ? <Button type="button" className="quiet" onClick={onManageSettings}>Edit settings</Button> : null}
      >
        <p>{moistureRangeLabel}</p>
      </Panel>

      {canCreate ? (
        <Panel title="Record drying / moisture reading">
          {formError ? <Alert title="Could not save reading" level="red">{formError}</Alert> : null}
          <FormGrid onSubmit={(event) => void submit(event)}>
              <Field label="Source lot">
                <Select value={lotId} onChange={(e) => setLotId(e.target.value)} disabled={saving}>
                  <option value="">Select lot…</option>
                  {data.drying.lots.map((lot) => (
                    <option key={lot.id} value={lot.id}>{lot.code} · {lot.item_name ?? 'Item'} · {formatQtl(lot.qty_kg)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Process run (optional)">
                <Select value={processRunId} onChange={(e) => setProcessRunId(e.target.value)} disabled={saving}>
                  <option value="">None</option>
                  {data.drying.process_runs.map((run) => (
                    <option key={run.id} value={run.id}>{formatDate(run.run_date)} · {run.process_type_name ?? 'Run'}{run.shift ? ` · ${run.shift}` : ''}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Stage">
                <Select value={stage} onChange={(e) => setStage(e.target.value)} disabled={saving}>
                  <option value="INTAKE">Intake</option>
                  <option value="AFTER_DRYER">After dryer</option>
                  <option value="PRE_MILLING">Pre milling</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>
              <Field label="Moisture (%)">
                <Input type="number" step="0.1" min="0" max="100" required value={moisturePct} onChange={(e) => setMoisturePct(e.target.value)} disabled={saving} />
              </Field>
              <Field label="Date / time">
                <Input type="datetime-local" required value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)} disabled={saving} />
              </Field>
              <Field label="Note">
                <Input value={note} onChange={(e) => setNote(e.target.value)} disabled={saving} />
              </Field>
            <FormActions>
              <Button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save reading'}</Button>
            </FormActions>
          </FormGrid>
        </Panel>
      ) : (
        <Alert title="Read-only" level="blue">You can view readings but need processing:create to add new entries.</Alert>
      )}

      <TableCard title="Moisture readings" subtitle="Newest first. Observations only — no stock or rate changes.">
        {data.drying.readings.length === 0 ? (
          <EmptyState>No moisture readings yet. Record values from your moisture meter or dryer panel.</EmptyState>
        ) : (
          <DataTable columns={[
            { id: 'when', label: 'When' },
            { id: 'lot', label: 'Lot' },
            { id: 'stage', label: 'Stage' },
            { id: 'moisture', label: 'Moisture' },
            { id: 'range', label: 'Range' },
            { id: 'note', label: 'Note' },
          ]}>
            {data.drying.readings.map((row) => {
              const status = String(row.range_status ?? 'unknown');
              return (
                <tr key={String(row.id)}>
                  <td>{formatDate(String(row.recorded_at))}</td>
                  <td>{String(row.lot_code ?? '—')}{row.item_name ? ` · ${String(row.item_name)}` : ''}</td>
                  <td>{String(row.stage ?? '—')}</td>
                  <td>{pct(Number(row.moisture_pct))}</td>
                  <td><Badge tone={rangeTone[status] ?? 'neutral'}>{rangeStatusLabel[status] ?? status}</Badge></td>
                  <td>{String(row.note ?? '—')}</td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </TableCard>
    </>
  );
}

function qualityContextLabel(row: Record<string, unknown>) {
  if (row.chain_name || row.chain_code) {
    return `Chain · ${String(row.chain_name ?? row.chain_code)}`;
  }
  if (row.lot_code) {
    return `Lot · ${String(row.lot_code)}${row.item_name ? ` · ${String(row.item_name)}` : ''}`;
  }
  if (row.process_type_name) return String(row.process_type_name);
  return '—';
}

function QualityTab({
  data,
  canCreate,
  onSaved,
}: {
  data: MillIntelligenceOverview;
  canCreate: boolean;
  onSaved: () => Promise<void>;
}) {
  const settings = data.settings;
  const [chainRunId, setChainRunId] = useState('');
  const [lotId, setLotId] = useState('');
  const [processRunId, setProcessRunId] = useState('');
  const [checkedAt, setCheckedAt] = useState(localDateTimeValue());
  const [shift, setShift] = useState('');
  const [headPct, setHeadPct] = useState('');
  const [brokenPct, setBrokenPct] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!chainRunId && !lotId && !processRunId) {
      setFormError('Select an active chain run or source lot. You can also link a posted process run after milling completes.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api('/api/mill-intelligence/quality-checks', json('POST', {
        chain_run_id: chainRunId || null,
        lot_id: lotId || null,
        process_run_id: processRunId || null,
        checked_at: toIsoRecordedAt(checkedAt),
        shift: shift || null,
        head_rice_pct: Number(headPct),
        broken_rice_pct: Number(brokenPct),
        note: note || null,
      }));
      setHeadPct('');
      setBrokenPct('');
      setNote('');
      setShift('');
      setChainRunId('');
      setLotId('');
      setProcessRunId('');
      setCheckedAt(localDateTimeValue());
      await onSaved();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not save QC sample');
    } finally {
      setSaving(false);
    }
  }

  const latest = data.quality.latest;
  const activeChains = data.quality.chain_runs.filter((run) => run.status === 'IN_PROGRESS' || run.status === 'PAUSED');

  return (
    <>
      <div className="kpi-grid dashboard-kpis">
        <Metric label="Latest head rice" value={latest ? pct(latest.head_rice_pct) : '—'} />
        <Metric label="Latest broken rice" value={latest ? pct(latest.broken_rice_pct) : '—'} />
        <Metric
          label="Configured thresholds"
          value={
            settings.head_rice_min_pct != null || settings.broken_rice_max_pct != null
              ? `Head ≥ ${settings.head_rice_min_pct ?? '—'}% · Broken ≤ ${settings.broken_rice_max_pct ?? '—'}%`
              : 'Not configured'
          }
        />
      </div>

      {canCreate ? (
        <Panel title="Record QC sample">
          <p className="muted" style={{ marginBottom: 12 }}>
            Log samples during the shift from an active chain run or source lot. Link a posted process run later if you want the sample tied to finished production.
          </p>
          {formError ? <Alert title="Could not save QC sample" level="red">{formError}</Alert> : null}
          <FormGrid onSubmit={(event) => void submit(event)}>
            <Field label="Active chain run">
              <Select value={chainRunId} onChange={(e) => setChainRunId(e.target.value)} disabled={saving}>
                <option value="">None</option>
                {activeChains.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.code ?? run.id} · {run.chain_name ?? 'Chain'}{run.start_date ? ` · ${formatDate(run.start_date)}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Source lot">
              <Select value={lotId} onChange={(e) => setLotId(e.target.value)} disabled={saving}>
                <option value="">None</option>
                {data.quality.lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>{lot.code} · {lot.item_name ?? 'Item'} · {formatQtl(lot.qty_kg)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Posted process run (optional)">
              <Select value={processRunId} onChange={(e) => setProcessRunId(e.target.value)} disabled={saving}>
                <option value="">None</option>
                {data.drying.process_runs.map((run) => (
                  <option key={run.id} value={run.id}>{formatDate(run.run_date)} · {run.process_type_name ?? 'Run'}{run.shift ? ` · ${run.shift}` : ''}</option>
                ))}
              </Select>
            </Field>
            <Field label="Sample time">
              <Input type="datetime-local" required value={checkedAt} onChange={(e) => setCheckedAt(e.target.value)} disabled={saving} />
            </Field>
            <Field label="Shift">
              <Input placeholder="A / B / C" value={shift} onChange={(e) => setShift(e.target.value)} disabled={saving} />
            </Field>
            <Field label="Head rice (%)">
              <Input type="number" step="0.1" min="0" max="100" required value={headPct} onChange={(e) => setHeadPct(e.target.value)} disabled={saving} />
            </Field>
            <Field label="Broken rice (%)">
              <Input type="number" step="0.1" min="0" max="100" required value={brokenPct} onChange={(e) => setBrokenPct(e.target.value)} disabled={saving} />
            </Field>
            <Field label="Note">
              <Input value={note} onChange={(e) => setNote(e.target.value)} disabled={saving} />
            </Field>
            <FormActions>
              <Button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save QC sample'}</Button>
            </FormActions>
          </FormGrid>
        </Panel>
      ) : (
        <Alert title="Read-only" level="blue">You can view QC samples but need processing:create to add new entries.</Alert>
      )}

      <TableCard title="Recent QC samples" subtitle="Samples only — posted production output is not rewritten.">
        {data.quality.checks.length === 0 ? (
          <EmptyState>
            No QC samples recorded yet.
            <br />
            Enter head and broken percentages from physical QC samples before trends can be shown.
          </EmptyState>
        ) : (
          <DataTable columns={[
            { id: 'when', label: 'When' },
            { id: 'context', label: 'Linked to' },
            { id: 'shift', label: 'Shift' },
            { id: 'head', label: 'Head %' },
            { id: 'broken', label: 'Broken %' },
            { id: 'flags', label: 'Flags' },
            { id: 'note', label: 'Note' },
          ]}>
            {data.quality.checks.map((row) => {
              const head = Number(row.head_rice_pct);
              const broken = Number(row.broken_rice_pct);
              const warnings = qualityCheckWarnings(head, broken, settings.head_rice_min_pct, settings.broken_rice_max_pct);
              return (
                <tr key={String(row.id)}>
                  <td>{formatDate(String(row.checked_at))}</td>
                  <td>{qualityContextLabel(row)}</td>
                  <td>{String(row.shift ?? '—')}</td>
                  <td>{pct(head)}</td>
                  <td>{pct(broken)}</td>
                  <td>
                    {warnings.headLow ? <Badge tone="danger">Head low</Badge> : null}
                    {warnings.brokenHigh ? <Badge tone="danger">Broken high</Badge> : null}
                    {!warnings.headLow && !warnings.brokenHigh ? <Badge tone="success">OK</Badge> : null}
                  </td>
                  <td>{String(row.note ?? '—')}</td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </TableCard>
    </>
  );
}
