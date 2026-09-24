'use client';

import { AppLink } from './app-link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import { AuthApp } from './auth-app';
import { millHeaderMeta } from '../lib/app-meta';
import { canViewFinance } from '../lib/permissions';
import { useSession } from '../lib/session';
import { Button, Card } from './ui';

type TrendRange = 'daily' | 'weekly' | 'monthly';

type GateEntry = {
  id: string;
  token_no?: string;
  supplier_name?: string;
  buyer_name?: string;
  gross_kg?: number;
  tare_kg?: number;
  status?: string;
};

type Overview = {
  today: string;
  mill: { loss_limit_pct: number };
  kpis: Record<string, number | undefined>;
  mass_balance: {
    in_kg: number;
    rice_kg: number;
    bran_kg: number;
    husk_kg: number;
    broken_kg: number;
    unexplained_kg: number;
    unexplained_pct: number;
  };
  alerts: { level: 'red' | 'amber' | 'blue'; title: string; body: string }[];
  stock_by_item: { item_name: string; quantity_base: number }[];
  item_flows: { item_name: string; incoming_base: number; outgoing_base: number }[];
  processing_summary: { line_type: string; quantity_base: number }[];
  processing_today: { line_type: string; quantity_base: number }[];
  trend: { range: TrendRange; label: string; data: { date: string; in_kg: number; out_kg: number }[] };
  gate: GateEntry[];
  godowns: unknown[];
  suppliers: unknown[];
  buyers: unknown[];
  items: unknown[];
  saudas: unknown[];
  lots: unknown[];
  onboarding: { gate_count?: number };
};

const STATUS_LABELS: Record<string, [string, string, string]> = {
  at_gate: ['At gate', '#EEF1F5', '#475467'],
  weighing: ['Weighing', '#FEF3D6', '#8A6A16'],
  in_lab: ['In lab', '#E7EEF8', '#2A5CA8'],
  weighed: ['Weighed', '#E6F0E9', '#256238'],
  unloading: ['Unloading', '#FEF3D6', '#8A6A16'],
  done: ['Done', '#E6F0E9', '#256238'],
};

const qtl = (kg: number | undefined) =>
  `${((kg ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} qtl`;

const pct = (value: number) => `${value}%`;

const rupees = (paise: number | undefined) =>
  paise == null
    ? '—'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);

const netKg = (entry: GateEntry) =>
  entry.gross_kg == null || entry.tare_kg == null ? 0 : Math.max(0, entry.gross_kg - entry.tare_kg);

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const roleLabel = (role: string) => {
  if (role === 'manager') return 'Manager';
  if (role === 'accountant') return 'Accountant';
  if (role === 'gate_operator') return 'Gate operator';
  if (role === 'production_operator') return 'Production operator';
  return 'Owner';
};

function StatusPill({ status }: { status?: string }) {
  const key = (status ?? '').toLowerCase();
  const [label, bg, color] = STATUS_LABELS[key] ?? [status ?? '—', '#EEF1F5', '#475467'];
  return (
    <span className="pill" style={{ background: bg, color }}>
      {label}
    </span>
  );
}

function trendBucketLabel(range: TrendRange, date: string) {
  const parsed = range === 'monthly' ? new Date(`${date}-01T00:00:00`) : new Date(`${date}T00:00:00`);
  if (range === 'monthly') return parsed.toLocaleDateString('en-IN', { month: 'short' });
  if (range === 'weekly') return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  return parsed.toLocaleDateString('en-IN', { weekday: 'short' });
}

function MassBalanceCard({
  massBalance,
  lossLimit,
}: {
  massBalance: Overview['mass_balance'];
  lossLimit: number;
}) {
  const input = massBalance.in_kg || 0;
  const segment = (kg: number) => (input > 0 ? Math.round((kg / input) * 100) : 0);
  const over = input > 0 && massBalance.unexplained_pct > lossLimit;
  const rows = [
    ['Rice', massBalance.rice_kg, '#BE8A16'],
    ['Bran', massBalance.bran_kg, '#8C6B3F'],
    ['Husk', massBalance.husk_kg, '#CBB78C'],
    ['Broken', massBalance.broken_kg, '#98A2B3'],
  ].filter(([, kg]) => Number(kg) > 0);

  return (
    <Card className="dashboard-card">
      <div className="card-title-row">
        <div>
          <h2>Today&apos;s mass balance</h2>
        </div>
        <AppLink href="/app/processing">
          <Button className="quiet">Open Processing</Button>
        </AppLink>
      </div>
      {input <= 0 ? (
        <p className="empty-state">
          No production entered for today yet.
          <br />
          Use Processing to post normalized inputs, outputs and measurable loss.
        </p>
      ) : (
        <>
          <div className="mb-bar" style={{ margin: '0 27px' }}>
            {rows.map(([, kg, color]) => (
              <span key={color} style={{ width: `${segment(kg as number)}%`, background: color }} />
            ))}
            {massBalance.unexplained_kg > 0 && (
              <span
                style={{
                  width: `${segment(massBalance.unexplained_kg)}%`,
                  background: '#C0451C',
                  animation: 'ms-pulse 1.8s ease-in-out infinite',
                }}
              />
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 27px 0' }}>
            {rows.map(([name, kg]) => (
              <div className="mb-row" key={name}>
                <span className="muted">{name}</span>
                <strong>{qtl(kg as number)} · {segment(kg as number)}%</strong>
              </div>
            ))}
          </div>
          {over ? (
            <div className="warn-box" style={{ margin: '16px 27px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>⚠ Unexplained</span>
                <strong style={{ fontSize: 18, color: 'var(--red)' }}>
                  {qtl(massBalance.unexplained_kg)} · {pct(massBalance.unexplained_pct)}
                </strong>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 5 }}>
                Above your {lossLimit}% limit.
              </div>
            </div>
          ) : (
            <div className="ok-box" style={{ margin: '16px 27px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>✓ Unexplained</span>
                <strong style={{ fontSize: 18, color: 'var(--green)' }}>
                  {qtl(massBalance.unexplained_kg)} · {pct(massBalance.unexplained_pct)}
                </strong>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 5 }}>
                Within your {lossLimit}% limit.
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function ProcessingBalanceCard({ summary }: { summary: Overview['processing_today'] }) {
  const totals: Record<string, number> = {};
  summary.forEach((row) => {
    totals[row.line_type] = Number(row.quantity_base) || 0;
  });
  const input = totals.INPUT || 0;
  const output = totals.OUTPUT || 0;
  const loss = totals.LOSS || 0;
  const unexplained = Math.max(0, input - output - loss);
  const pctOf = (kg: number) => (input > 0 ? Math.round((kg / input) * 100) : 0);
  const pctUnexplained = input > 0 ? Math.round((unexplained / input) * 1000) / 10 : 0;

  return (
    <Card className="dashboard-card">
      <div className="card-title-row">
        <div>
          <h2>Today&apos;s processing balance</h2>
        </div>
        <AppLink href="/app/processing">
          <Button className="quiet">Open Processing</Button>
        </AppLink>
      </div>
      <div className="mb-bar" style={{ margin: '0 27px' }}>
        {output > 0 && <span style={{ width: `${pctOf(output)}%`, background: '#BE8A16' }} />}
        {loss > 0 && <span style={{ width: `${pctOf(loss)}%`, background: '#CBB78C' }} />}
        {unexplained > 0 && <span style={{ width: `${pctOf(unexplained)}%`, background: '#C0451C' }} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 27px 0' }}>
        <div className="mb-row"><span className="muted">Input</span><strong>{qtl(input)}</strong></div>
        <div className="mb-row"><span className="muted">Output</span><strong>{qtl(output)} · {pctOf(output)}%</strong></div>
        <div className="mb-row"><span className="muted">Measured loss</span><strong>{qtl(loss)} · {pctOf(loss)}%</strong></div>
      </div>
      {unexplained > 0 ? (
        <div className="warn-box" style={{ margin: '16px 27px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>⚠ Unexplained</span>
            <strong style={{ fontSize: 18, color: 'var(--red)' }}>
              {qtl(unexplained)} · {pctUnexplained}%
            </strong>
          </div>
        </div>
      ) : (
        <div className="ok-box" style={{ margin: '16px 27px 20px' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>✓ All process input accounted for</span>
        </div>
      )}
    </Card>
  );
}

const ONBOARDING_CONNECTED_KEY = (millKey: string) => `ms-onboarding-connected:${millKey}`;
const ONBOARDING_CELEBRATION_MS = 8000;

function readOnboardingDismissed(millKey: string) {
  try {
    return localStorage.getItem(ONBOARDING_CONNECTED_KEY(millKey)) === '1';
  } catch {
    return false;
  }
}

function persistOnboardingDismissed(millKey: string) {
  try {
    localStorage.setItem(ONBOARDING_CONNECTED_KEY(millKey), '1');
  } catch {
    // Ignore storage failures in private mode.
  }
}

function OnboardingCard({ overview, millKey }: { overview: Overview; millKey: string }) {
  const steps = [
    { title: 'Add parties', done: overview.suppliers.length > 0 && overview.buyers.length > 0, detail: 'Buyers, sellers, and brokers in one directory.', href: '/app/parties' },
    { title: 'Check items', done: overview.items.length > 0, detail: 'Raw material, finished goods and by-products.', href: '/app/items' },
    { title: 'Create a sauda', done: overview.saudas.length > 0, detail: 'Record the purchase deal before the truck arrives.', href: '/app/purchase' },
    { title: 'Record gate entry', done: (overview.onboarding.gate_count ?? overview.gate.length) > 0, detail: 'Enter incoming/outgoing trucks and weights.', href: '/app/gate' },
    { title: 'Move to stock', done: overview.lots.length > 0, detail: 'Add completed incoming trucks into a godown lot.', href: '/app/stock' },
  ];
  const done = steps.every((step) => step.done);
  const [celebrationVisible, setCelebrationVisible] = useState(() => !readOnboardingDismissed(millKey));

  useEffect(() => {
    if (!done || !celebrationVisible) return;
    const timer = window.setTimeout(() => {
      persistOnboardingDismissed(millKey);
      setCelebrationVisible(false);
    }, ONBOARDING_CELEBRATION_MS);
    return () => window.clearTimeout(timer);
  }, [done, celebrationVisible, millKey]);

  if (done) {
    if (!celebrationVisible) return null;
    return (
      <Card className="dashboard-card guide-card celebrate-card">
        <div className="celebrate-mark" aria-hidden="true">
          <CheckIcon size={22} />
        </div>
        <div>
          <h2>Mill flow is connected</h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600 }}>
            Parties, items, sauda, gate and stock are ready for daily use.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card className="dashboard-card guide-card">
      <div className="card-title-row">
        <div>
          <h2>First days flow</h2>
          <p>Follow this order until the mill data starts feeling natural.</p>
        </div>
      </div>
      <div className="guide-steps" style={{ padding: '0 27px 20px' }}>
        {steps.map((step, index) => (
          <div className={`guide-step${step.done ? ' done' : ''}`} key={step.title}>
            <span className="guide-num">{step.done ? <CheckIcon size={13} /> : index + 1}</span>
            <div>
              <strong>{step.title}</strong>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{step.detail}</div>
            </div>
            {!step.done ? (
              <AppLink href={step.href}>
                <Button className="quiet">Start</Button>
              </AppLink>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function DashboardApp() {
  const { session, setSession, sessionError } = useSession();
  const headerMeta = millHeaderMeta(session);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [range, setRange] = useState<TrendRange>('daily');
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (nextRange: TrendRange) => {
    const response = await fetch(`/api/overview?range=${nextRange}`, { credentials: 'include' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'Could not load overview');
    setOverview(body as Overview);
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadOverview(range).catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : 'Could not load overview'),
    );
  }, [session, range, loadOverview]);

  const kpis = useMemo(() => {
    if (!overview || !session) return [];
    const k = overview.kpis;
    const mb = overview.mass_balance;
    const lossLimit = overview.mill.loss_limit_pct;
    if (!canViewFinance(session)) {
      return [
        { label: 'In gate queue', value: String(k.trucks_in_queue ?? 0), detail: 'trucks now inside' },
        { label: 'Arriving today', value: qtl(k.incoming_today_kg), detail: `${k.weighed_today ?? 0} trucks weighed` },
        { label: 'Dispatched today', value: qtl(k.outgoing_today_kg), detail: 'all items', tone: 'green' as const },
        {
          label: 'Pending lab tests',
          value: String(k.lab_pending ?? 0),
          detail: (k.lab_pending ?? 0) > 0 ? 'trucks waiting on moisture' : 'all clear',
          tone: (k.lab_pending ?? 0) > 0 ? 'red' as const : undefined,
        },
      ];
    }
    if (session.role === 'accountant' && canViewFinance(session)) {
      return [
        { label: 'Payables', value: rupees(k.payables_paise), detail: 'to suppliers', tone: 'red' as const },
        { label: 'Receivables', value: rupees(k.receivables_paise), detail: 'from buyers', tone: 'green' as const },
        { label: 'Cash received today', value: rupees(k.cash_received_today_paise), detail: 'against invoices' },
        { label: 'Broker advances', value: rupees(k.advances_open_paise), detail: 'on open saudas' },
      ];
    }
    const over = mb.in_kg > 0 && mb.unexplained_pct > lossLimit;
    const marginPct =
      (k.sale_value_paise ?? 0) > 0
        ? Math.round(((k.gross_margin_today_paise ?? 0) / (k.sale_value_paise ?? 1)) * 1000) / 10
        : null;
    return [
      {
        label: 'Gross margin today',
        value: rupees(k.gross_margin_today_paise),
        detail: marginPct != null ? `${marginPct}% of sales` : 'sales − purchases',
        tone: 'green' as const,
      },
      {
        label: 'Unexplained loss',
        value: mb.in_kg > 0 ? pct(mb.unexplained_pct) : '—',
        detail: mb.in_kg > 0 ? `${over ? 'Above' : 'Within'} ${lossLimit}% limit` : 'no production yet',
        tone: over ? 'red' as const : undefined,
      },
      { label: 'Cash paid today', value: rupees(k.cash_paid_today_paise), detail: `${k.weighed_today ?? 0} trucks` },
      {
        label: 'Stock value',
        value: rupees(k.stock_value_paise),
        detail: `across ${overview.godowns.length} godowns`,
      },
    ];
  }, [overview, session]);

  const processTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    (overview?.processing_summary ?? []).forEach((row) => {
      totals[row.line_type] = Number(row.quantity_base) || 0;
    });
    const input = totals.INPUT || 0;
    const output = totals.OUTPUT || 0;
    const loss = totals.LOSS || 0;
    const yieldPct = input > 0 ? Math.round((output / input) * 1000) / 10 : null;
    return { input, output, loss, yieldPct };
  }, [overview]);

  const hasProcessingToday = useMemo(
    () =>
      (overview?.processing_today ?? []).some(
        (row) => row.line_type === 'INPUT' && Number(row.quantity_base) > 0,
      ),
    [overview],
  );

  const trendMax = useMemo(() => {
    const data = overview?.trend.data ?? [];
    return Math.max(...data.map((point) => Math.max(point.in_kg, point.out_kg, 1)), 1);
  }, [overview]);

  if (session === undefined) {
    return <main className="auth-page"><p className="muted">Loading dashboard…</p></main>;
  }
  if (!session) {
    return (
      <>
        <AuthApp onSuccess={setSession} />
        {sessionError ? <p className="error">{sessionError}</p> : null}
      </>
    );
  }

  const trend = overview?.trend;
  const stockRows = (overview?.stock_by_item ?? []).filter((row) => Number(row.quantity_base) !== 0);
  const flowRows = (overview?.item_flows ?? []).filter(
    (row) => Number(row.incoming_base) || Number(row.outgoing_base),
  );
  const recentGate = (overview?.gate ?? []).slice(0, 5);

  return (
    <main className="shell">
      <AppHeader session={session} />
      <section className="workspace">
        <header className="app-page-header">
          <div>
            <h1>Dashboard</h1>
            <p>Today at a glance · {roleLabel(session.role)} view</p>
          </div>
          <div className="app-page-actions">
            <div className="period-toggle">
              {(['daily', 'weekly', 'monthly'] as TrendRange[]).map((option) => (
                <Button
                  key={option}
                  className={range === option ? 'selected' : ''}
                  type="button"
                  onClick={() => setRange(option)}
                >
                  {option[0].toUpperCase() + option.slice(1)}
                </Button>
              ))}
            </div>
            <div className="date-chip">
              <div className="d">{headerMeta.date}</div>
              {headerMeta.season ? <div className="s">{headerMeta.season}</div> : null}
            </div>
          </div>
        </header>

        {error && <p className="error">{error}</p>}
        {!overview && !error && <p className="muted">Loading operational data…</p>}

        {overview && (
          <>
            <OnboardingCard overview={overview} millKey={session.mill.id || session.mill.name} />

            <div className="kpi-grid dashboard-kpis">
              {kpis.map((kpi) => (
                <Metric
                  key={kpi.label}
                  label={kpi.label}
                  value={kpi.value}
                  detail={kpi.detail}
                  tone={kpi.tone}
                />
              ))}
            </div>

            <div className="dashboard-grid2">
              <Card className="dashboard-card">
                <div className="card-title-row">
                  <div>
                    <h2>Inbound vs. outbound</h2>
                    <p>all items · quintals · {trend?.label ?? 'last 7 days'}</p>
                  </div>
                </div>
                <div className="trend-chart-panel">
                  <div className="trend-chart">
                    {(trend?.data ?? []).map((point) => (
                      <div className="trend-bar-group" key={point.date}>
                        <div className="trend-bars">
                          <div
                            className="trend-bar in"
                            style={{ height: `${Math.round((point.in_kg / trendMax) * 140)}px` }}
                          />
                          <div
                            className="trend-bar out"
                            style={{ height: `${Math.round((point.out_kg / trendMax) * 140)}px` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="trend-labels-row">
                    {(trend?.data ?? []).map((point) => (
                      <div className="trend-label" key={`${point.date}-label`}>
                        {trendBucketLabel(trend?.range ?? 'daily', point.date)}
                      </div>
                    ))}
                  </div>
                  <div className="trend-legend">
                    <span><i className="in" />↙ Arriving</span>
                    <span><i className="out" />↗ Dispatching</span>
                  </div>
                </div>
              </Card>

              {hasProcessingToday ? (
                <ProcessingBalanceCard summary={overview.processing_today} />
              ) : (
                <MassBalanceCard massBalance={overview.mass_balance} lossLimit={overview.mill.loss_limit_pct} />
              )}
            </div>

            <Card className="dashboard-card">
              <div className="card-title-row">
                <div>
                  <h2>Current stock by item</h2>
                  <p>Normalized ledger quantities</p>
                </div>
                <AppLink href="/app/stock">
                  <Button className="quiet">View stock</Button>
                </AppLink>
              </div>
              {stockRows.length ? (
                stockRows.slice(0, 8).map((item) => (
                  <div className="ledger-row" key={item.item_name}>
                    <span>{item.item_name}</span>
                    <strong>{qtl(item.quantity_base)}</strong>
                  </div>
                ))
              ) : (
                <p className="empty-state">No posted stock movements yet.</p>
              )}
            </Card>

            <Card className="dashboard-card">
              <div className="card-title-row">
                <div>
                  <h2>Item movements · {trend?.label ?? 'last 7 days'}</h2>
                  <p>Direction is recorded on each transaction; item category never determines IN or OUT.</p>
                </div>
              </div>
              <div className="dashboard-table-wrap ms-scroll">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Arriving</th>
                      <th>Dispatching</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flowRows.length ? (
                      flowRows.slice(0, 8).map((row) => (
                        <tr key={row.item_name}>
                          <td><strong>{row.item_name}</strong></td>
                          <td>↙ IN {qtl(row.incoming_base)}</td>
                          <td>↗ OUT {qtl(row.outgoing_base)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="empty-state">
                          No completed item movements in the last 30 days.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="dashboard-card">
              <div className="card-title-row">
                <div>
                  <h2>Processing · {trend?.label ?? 'last 7 days'}</h2>
                  <p>Normalized movement totals across posted process runs.</p>
                </div>
                <AppLink href="/app/processing">
                  <Button className="quiet">View runs</Button>
                </AppLink>
              </div>
              <div className="processing-mini-kpis" style={{ padding: '0 27px 20px' }}>
                <Metric label="Inputs" value={qtl(processTotals.input)} detail="posted runs" />
                <Metric label="Outputs" value={qtl(processTotals.output)} detail="posted runs" />
                <Metric label="Measured loss" value={qtl(processTotals.loss)} detail="posted runs" />
                <Metric
                  label="Output yield"
                  value={processTotals.yieldPct == null ? '—' : `${processTotals.yieldPct}%`}
                  detail="output / input"
                />
              </div>
            </Card>

            <div className="dashboard-grid2r">
              <Card className="dashboard-card">
                <div className="card-title-row">
                  <div>
                    <h2>Needs your eyes</h2>
                  </div>
                </div>
                {overview.alerts.length ? (
                  overview.alerts.map((alert) => (
                    <article className="alert-row" key={`${alert.title}-${alert.body}`}>
                      <span className={`alert-dot ${alert.level}`} />
                      <div className="alert-copy">
                        <strong>{alert.title}</strong>
                        <span>{alert.body}</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="empty-state">Nothing needs your eyes right now.</p>
                )}
              </Card>

              <Card className="dashboard-card">
                <div className="card-title-row">
                  <div>
                    <h2>Recent gate activity</h2>
                  </div>
                </div>
                <div className="dashboard-table-wrap ms-scroll">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Token</th>
                        <th>Party</th>
                        <th>Net</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentGate.length ? (
                        recentGate.map((entry) => (
                          <tr key={entry.id}>
                            <td className="dashboard-token">{entry.token_no ?? '—'}</td>
                            <td>{entry.supplier_name || entry.buyer_name || '—'}</td>
                            <td>{netKg(entry) > 0 ? qtl(netKg(entry)) : '—'}</td>
                            <td><StatusPill status={entry.status} /></td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="empty-state">No gate activity today yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'green' | 'red';
}) {
  const color = tone === 'green' ? 'var(--green)' : tone === 'red' ? 'var(--red)' : undefined;
  return (
    <Card className="metric">
      <span>{label}</span>
      <strong style={color ? { color } : undefined}>{value}</strong>
      <small>{detail}</small>
    </Card>
  );
}
