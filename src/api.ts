// Business API. All routes here run behind requireAuth (see index.ts) and are scoped to
// the session's mill. Money is integer paise; weights are integer kg (UI shows quintals).
import { Hono } from 'hono';
import type { AppEnv } from './index';

// India runs the mill day on IST regardless of where the Worker executes.
export function istToday(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function uuid(): string {
  return crypto.randomUUID();
}

async function nextCode(db: D1Database, millId: string, key: string, prefix: string): Promise<string> {
  const row = await db
    .prepare(
      `INSERT INTO counters (mill_id, key, value) VALUES (?, ?, 1)
       ON CONFLICT(mill_id, key) DO UPDATE SET value = value + 1
       RETURNING value`,
    )
    .bind(millId, key)
    .first<{ value: number }>();
  return `${prefix}-${row!.value}`;
}

const GATE_STATUSES = ['at_gate', 'weighing', 'in_lab', 'weighed', 'unloading', 'done'] as const;
const SAUDA_STATUSES = ['open', 'advance_paid', 'settled', 'disputed'] as const;

// The Manager role must never receive money. Strip every *paise* field server-side,
// wherever it appears — new fields are money-safe by default.
export function stripMoney(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMoney);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!k.includes('paise')) out[k] = stripMoney(v);
    }
    return out;
  }
  return value;
}

type MassBalance = {
  in_kg: number; rice_kg: number; bran_kg: number; husk_kg: number; broken_kg: number;
  unexplained_kg: number; unexplained_pct: number;
};

function massBalance(run: { paddy_in_kg: number; rice_out_kg: number; bran_out_kg: number; husk_out_kg: number; broken_out_kg: number } | null): MassBalance {
  const i = run?.paddy_in_kg ?? 0;
  const rice = run?.rice_out_kg ?? 0, bran = run?.bran_out_kg ?? 0, husk = run?.husk_out_kg ?? 0, broken = run?.broken_out_kg ?? 0;
  const un = Math.max(0, i - rice - bran - husk - broken);
  return {
    in_kg: i, rice_kg: rice, bran_kg: bran, husk_kg: husk, broken_kg: broken,
    unexplained_kg: un, unexplained_pct: i > 0 ? Math.round((un / i) * 1000) / 10 : 0,
  };
}

export const api = new Hono<AppEnv>();

// One round trip powers the whole SPA: batched reads, KPIs computed here.
api.get('/overview', async (c) => {
  const { user, mill } = c.get('session');
  const db = c.env.DB;
  const today = istToday();
  const weekAgo = istToday(-6);

  const [gateRes, gateWeekRes, saudasRes, lotsRes, godownsRes, suppliersRes, buyersRes, itemsRes, prodRes, payTodayRes] =
    await db.batch([
      db.prepare(
        `SELECT g.*, COALESCE(g.gross_kg,0)-COALESCE(g.tare_kg,0) AS net_kg,
                s.name AS supplier_name, b.name AS buyer_name, i.name AS item_name
         FROM gate_entries g
         LEFT JOIN suppliers s ON s.id = g.supplier_id
         LEFT JOIN buyers b ON b.id = g.buyer_id
         LEFT JOIN items i ON i.id = g.item_id
         WHERE g.mill_id = ?1 AND g.entry_date >= ?2
         ORDER BY g.created_at DESC LIMIT 200`,
      ).bind(mill.id, weekAgo),
      db.prepare(
        `SELECT entry_date, direction,
                SUM(MAX(COALESCE(gross_kg,0)-COALESCE(tare_kg,0),0)) AS net_kg
         FROM gate_entries WHERE mill_id = ?1 AND entry_date >= ?2
         GROUP BY entry_date, direction`,
      ).bind(mill.id, weekAgo),
      db.prepare(
        `SELECT sa.*, s.name AS supplier_name, i.name AS item_name,
                sa.qty_kg * sa.rate_paise_per_qtl / 100 AS value_paise
         FROM saudas sa
         LEFT JOIN suppliers s ON s.id = sa.supplier_id
         LEFT JOIN items i ON i.id = sa.item_id
         WHERE sa.mill_id = ?1 ORDER BY sa.created_at DESC LIMIT 200`,
      ).bind(mill.id),
      db.prepare(
        `SELECT l.*, gd.name AS godown_name, i.name AS item_name
         FROM lots l
         LEFT JOIN godowns gd ON gd.id = l.godown_id
         LEFT JOIN items i ON i.id = l.item_id
         WHERE l.mill_id = ?1 ORDER BY l.in_date DESC, l.code DESC LIMIT 300`,
      ).bind(mill.id),
      db.prepare(
        `SELECT gd.*, COALESCE((SELECT SUM(qty_kg) FROM lots l WHERE l.godown_id = gd.id), 0) AS stock_kg
         FROM godowns gd WHERE gd.mill_id = ?1 ORDER BY gd.name`,
      ).bind(mill.id),
      db.prepare(
        `SELECT s.*,
           COALESCE((SELECT SUM(COALESCE(g.gross_kg,0)-COALESCE(g.tare_kg,0)) FROM gate_entries g
                     WHERE g.supplier_id = s.id AND g.direction='in' AND g.status='done'), 0) AS supplied_kg,
           (SELECT MAX(g.created_at) FROM gate_entries g WHERE g.supplier_id = s.id) AS last_at,
           MAX(0,
             COALESCE((SELECT SUM(sa.qty_kg * sa.rate_paise_per_qtl / 100) FROM saudas sa
                       WHERE sa.supplier_id = s.id AND sa.status <> 'disputed'), 0)
             - COALESCE((SELECT SUM(p.amount_paise) FROM payments p
                         WHERE p.party_kind='supplier' AND p.party_id = s.id AND p.direction='paid'), 0)
           ) AS outstanding_paise
         FROM suppliers s WHERE s.mill_id = ?1 ORDER BY s.name`,
      ).bind(mill.id),
      db.prepare(
        `SELECT b.*,
           COALESCE((SELECT SUM(COALESCE(g.gross_kg,0)-COALESCE(g.tare_kg,0)) FROM gate_entries g
                     WHERE g.buyer_id = b.id AND g.direction='out' AND g.status='done'), 0) AS bought_kg,
           (SELECT MAX(g.created_at) FROM gate_entries g WHERE g.buyer_id = b.id) AS last_at,
           MAX(0,
             COALESCE((SELECT SUM((COALESCE(g.gross_kg,0)-COALESCE(g.tare_kg,0)) * COALESCE(g.rate_paise_per_qtl,0) / 100)
                       FROM gate_entries g WHERE g.buyer_id = b.id AND g.direction='out' AND g.status='done'), 0)
             - COALESCE((SELECT SUM(p.amount_paise) FROM payments p
                         WHERE p.party_kind='buyer' AND p.party_id = b.id AND p.direction='received'), 0)
           ) AS receivable_paise
         FROM buyers b WHERE b.mill_id = ?1 ORDER BY b.name`,
      ).bind(mill.id),
      db.prepare(
        `SELECT i.*, COALESCE((SELECT SUM(l.qty_kg) FROM lots l WHERE l.item_id = i.id), 0) AS stock_kg
         FROM items i WHERE i.mill_id = ?1 ORDER BY i.category, i.name`,
      ).bind(mill.id),
      db.prepare(
        `SELECT * FROM production_runs WHERE mill_id = ?1 AND run_date >= ?2 ORDER BY run_date`,
      ).bind(mill.id, weekAgo),
      db.prepare(
        `SELECT direction, COALESCE(SUM(amount_paise),0) AS total
         FROM payments WHERE mill_id = ?1 AND pay_date = ?2 GROUP BY direction`,
      ).bind(mill.id, today),
    ]);

  const gateAll = gateRes.results as Record<string, unknown>[];
  const gateToday = gateAll.filter((g) => g.entry_date === today);
  const prodRuns = prodRes.results as { run_date: string; paddy_in_kg: number; rice_out_kg: number; bran_out_kg: number; husk_out_kg: number; broken_out_kg: number }[];
  const todayRun = prodRuns.filter((r) => r.run_date === today).at(-1) ?? null;
  const mb = massBalance(todayRun);

  // 7-day paddy-in vs rice-out chart
  const weekMap = new Map<string, { in_kg: number; out_kg: number }>();
  for (let d = -6; d <= 0; d++) weekMap.set(istToday(d), { in_kg: 0, out_kg: 0 });
  for (const r of gateWeekRes.results as { entry_date: string; direction: string; net_kg: number }[]) {
    const slot = weekMap.get(r.entry_date);
    if (!slot) continue;
    if (r.direction === 'in') slot.in_kg = r.net_kg ?? 0;
    else slot.out_kg = r.net_kg ?? 0;
  }
  const week = [...weekMap.entries()].map(([date, v]) => ({ date, ...v }));

  const inToday = gateToday.filter((g) => g.direction === 'in');
  const outToday = gateToday.filter((g) => g.direction === 'out' && g.status === 'done');
  const doneIn = inToday.filter((g) => ['weighed', 'unloading', 'done'].includes(g.status as string));
  const queue = inToday.filter((g) => g.status !== 'done');
  const paddyInKg = doneIn.reduce((a, g) => a + Math.max(0, g.net_kg as number), 0);
  const riceOutKg = outToday.reduce((a, g) => a + Math.max(0, g.net_kg as number), 0);
  const moistures = doneIn.map((g) => g.moisture_pct as number | null).filter((m): m is number => m != null);
  const avgMoisture = moistures.length ? Math.round((moistures.reduce((a, b) => a + b, 0) / moistures.length) * 10) / 10 : null;
  const labPending = inToday.filter((g) => g.status === 'in_lab').length;

  const payToday: Record<string, number> = {};
  for (const r of payTodayRes.results as { direction: string; total: number }[]) payToday[r.direction] = r.total;

  const saudas = saudasRes.results as Record<string, unknown>[];
  const lots = lotsRes.results as Record<string, unknown>[];
  const suppliers = suppliersRes.results as Record<string, unknown>[];
  const buyers = buyersRes.results as Record<string, unknown>[];

  const stockValuePaise = lots.reduce((a, l) => a + ((l.value_paise as number) ?? 0), 0);
  const purchaseValueToday = doneIn.reduce((a, g) => {
    const sauda = saudas.find((s) => s.id === g.sauda_id);
    const rate = (sauda?.rate_paise_per_qtl as number) ?? 0;
    return a + Math.round((Math.max(0, g.net_kg as number) * rate) / 100);
  }, 0);
  const salesValueToday = outToday.reduce(
    (a, g) => a + Math.round((Math.max(0, g.net_kg as number) * ((g.rate_paise_per_qtl as number) ?? 0)) / 100),
    0,
  );
  const payables = suppliers.reduce((a, s) => a + ((s.outstanding_paise as number) ?? 0), 0);
  const receivables = buyers.reduce((a, b) => a + ((b.receivable_paise as number) ?? 0), 0);
  const advancesOpen = saudas
    .filter((s) => s.status === 'open' || s.status === 'advance_paid')
    .reduce((a, s) => a + ((s.advance_paise as number) ?? 0), 0);

  const alerts: { level: 'red' | 'amber' | 'blue'; title: string; body: string }[] = [];
  if (mb.in_kg > 0 && mb.unexplained_pct > mill.loss_limit_pct) {
    alerts.push({
      level: 'red',
      title: `Unexplained loss ${mb.unexplained_pct}% today`,
      body: `Above your ${mill.loss_limit_pct}% limit — check today's production entries.`,
    });
  }
  for (const s of saudas.filter((s) => s.status === 'disputed').slice(0, 2)) {
    alerts.push({ level: 'blue', title: `${s.code} disputed`, body: `${s.supplier_name ?? 'Supplier'} dispute on ${s.item_name ?? 'lot'} — needs your call.` });
  }
  for (const gd of godownsRes.results as Record<string, unknown>[]) {
    const cap = (gd.capacity_qtl as number) * 100;
    if (cap > 0 && (gd.stock_kg as number) / cap > 0.9) {
      alerts.push({ level: 'amber', title: `${gd.name} is ${Math.round(((gd.stock_kg as number) / cap) * 100)}% full`, body: 'Plan dispatches or transfers before it blocks unloading.' });
    }
  }
  if (labPending > 0) alerts.push({ level: 'amber', title: `${labPending} lab test${labPending > 1 ? 's' : ''} pending`, body: 'Trucks are waiting on moisture results at the lab.' });

  const body = {
    me: { id: user.id, name: user.name, email: user.email, role: user.role },
    mill: { id: mill.id, name: mill.name, plan: mill.plan, loss_limit_pct: mill.loss_limit_pct, season_label: mill.season_label },
    today,
    kpis: {
      gross_margin_today_paise: salesValueToday - purchaseValueToday,
      sale_value_paise: salesValueToday,
      purchase_value_paise: purchaseValueToday,
      unexplained_pct: mb.unexplained_pct,
      cash_paid_today_paise: payToday.paid ?? 0,
      cash_received_today_paise: payToday.received ?? 0,
      stock_value_paise: stockValuePaise,
      trucks_in_queue: queue.length,
      weighed_today: doneIn.length,
      paddy_in_today_kg: paddyInKg,
      rice_out_today_kg: riceOutKg,
      avg_moisture: avgMoisture,
      lab_pending: labPending,
      payables_paise: payables,
      receivables_paise: receivables,
      advances_open_paise: advancesOpen,
    },
    mass_balance: mb,
    week,
    alerts,
    gate: gateToday,
    saudas,
    lots,
    godowns: godownsRes.results,
    suppliers,
    buyers,
    items: itemsRes.results,
    production: prodRuns,
  };

  return c.json(user.role === 'manager' ? (stripMoney(body) as typeof body) : body);
});

// ---- Gate & weighbridge workflow ----
api.post('/gate', async (c) => {
  const { mill } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>();
  const direction = b.direction === 'out' ? 'out' : 'in';
  const vehicle = String(b.vehicle_no ?? '').trim().toUpperCase();
  if (!vehicle) return c.json({ error: 'vehicle_no is required' }, 400);
  const token = await nextCode(c.env.DB, mill.id, 'token', 'TKN');
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO gate_entries (id, mill_id, token_no, direction, vehicle_no, supplier_id, buyer_id, item_id, sauda_id, rate_paise_per_qtl, entry_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, mill.id, token, direction, vehicle,
      (b.supplier_id as string) || null, (b.buyer_id as string) || null, (b.item_id as string) || null,
      (b.sauda_id as string) || null, Number.isFinite(b.rate_paise_per_qtl) ? Math.round(b.rate_paise_per_qtl as number) : null,
      istToday())
    .run();
  return c.json({ id, token_no: token }, 201);
});

api.patch('/gate/:id', async (c) => {
  const { mill } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>();
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const k of ['gross_kg', 'tare_kg', 'moisture_pct', 'rate_paise_per_qtl'] as const) {
    if (b[k] != null && Number.isFinite(Number(b[k]))) { sets.push(`${k} = ?`); vals.push(Number(b[k])); }
  }
  if (typeof b.status === 'string') {
    if (!GATE_STATUSES.includes(b.status as (typeof GATE_STATUSES)[number])) return c.json({ error: 'invalid status' }, 400);
    sets.push('status = ?'); vals.push(b.status);
  }
  if (!sets.length) return c.json({ error: 'nothing to update' }, 400);
  sets.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
  const res = await c.env.DB.prepare(`UPDATE gate_entries SET ${sets.join(', ')} WHERE id = ? AND mill_id = ?`)
    .bind(...vals, c.req.param('id'), mill.id)
    .run();
  if (!res.meta.changes) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

// ---- Saudas (owner/accountant only — managers never see rates) ----
api.post('/saudas', async (c) => {
  const { user, mill } = c.get('session');
  if (user.role === 'manager' || user.role === 'operator') return c.json({ error: 'not allowed for this role' }, 403);
  const b = await c.req.json<Record<string, unknown>>();
  const code = await nextCode(c.env.DB, mill.id, 'sauda', 'SAU');
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO saudas (id, mill_id, code, supplier_id, broker_name, item_id, qty_kg, rate_paise_per_qtl, moisture_pct, advance_paise, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, mill.id, code, (b.supplier_id as string) || null, String(b.broker_name ?? 'Direct'),
      (b.item_id as string) || null, Math.round(Number(b.qty_kg) || 0), Math.round(Number(b.rate_paise_per_qtl) || 0),
      b.moisture_pct != null ? Number(b.moisture_pct) : null, Math.round(Number(b.advance_paise) || 0), (b.note as string) || null)
    .run();
  return c.json({ id, code }, 201);
});

api.patch('/saudas/:id', async (c) => {
  const { user, mill } = c.get('session');
  if (user.role === 'manager' || user.role === 'operator') return c.json({ error: 'not allowed for this role' }, 403);
  const b = await c.req.json<Record<string, unknown>>();
  if (typeof b.status !== 'string' || !SAUDA_STATUSES.includes(b.status as (typeof SAUDA_STATUSES)[number])) {
    return c.json({ error: 'invalid status' }, 400);
  }
  const res = await c.env.DB.prepare(`UPDATE saudas SET status = ? WHERE id = ? AND mill_id = ?`)
    .bind(b.status, c.req.param('id'), mill.id).run();
  if (!res.meta.changes) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

// ---- Lots & production ----
api.post('/lots', async (c) => {
  const { mill } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>();
  const code = await nextCode(c.env.DB, mill.id, 'lot', 'LOT');
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO lots (id, mill_id, code, godown_id, item_id, qty_kg, moisture_pct, value_paise, in_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, mill.id, code, (b.godown_id as string) || null, (b.item_id as string) || null,
      Math.round(Number(b.qty_kg) || 0), b.moisture_pct != null ? Number(b.moisture_pct) : null,
      Math.round(Number(b.value_paise) || 0), (b.in_date as string) || istToday())
    .run();
  return c.json({ id, code }, 201);
});

api.post('/production', async (c) => {
  const { mill } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>();
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO production_runs (id, mill_id, run_date, paddy_in_kg, rice_out_kg, bran_out_kg, husk_out_kg, broken_out_kg, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, mill.id, (b.run_date as string) || istToday(),
      Math.round(Number(b.paddy_in_kg) || 0), Math.round(Number(b.rice_out_kg) || 0),
      Math.round(Number(b.bran_out_kg) || 0), Math.round(Number(b.husk_out_kg) || 0),
      Math.round(Number(b.broken_out_kg) || 0), (b.note as string) || null)
    .run();
  return c.json({ id }, 201);
});

// ---- Payments (owner/accountant only) ----
api.post('/payments', async (c) => {
  const { user, mill } = c.get('session');
  if (user.role === 'manager' || user.role === 'operator') return c.json({ error: 'not allowed for this role' }, 403);
  const b = await c.req.json<Record<string, unknown>>();
  const amount = Math.round(Number(b.amount_paise) || 0);
  if (amount <= 0) return c.json({ error: 'amount_paise must be positive' }, 400);
  if (b.party_kind !== 'supplier' && b.party_kind !== 'buyer') return c.json({ error: 'invalid party_kind' }, 400);
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO payments (id, mill_id, party_kind, party_id, direction, amount_paise, method, note, pay_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, mill.id, b.party_kind, String(b.party_id ?? ''),
      b.party_kind === 'supplier' ? 'paid' : 'received', amount,
      (b.method as string) || 'cash', (b.note as string) || null, (b.pay_date as string) || istToday())
    .run();
  return c.json({ id }, 201);
});

// ---- Masters ----
const MASTERS: Record<string, { table: string; cols: string[] }> = {
  suppliers: { table: 'suppliers', cols: ['name', 'type', 'place', 'phone'] },
  buyers: { table: 'buyers', cols: ['name', 'type', 'location', 'phone'] },
  items: { table: 'items', cols: ['name', 'category', 'hsn', 'unit', 'typical_otr_pct'] },
  godowns: { table: 'godowns', cols: ['name', 'capacity_qtl'] },
};

api.post('/:master{suppliers|buyers|items|godowns}', async (c) => {
  const { mill } = c.get('session');
  const def = MASTERS[c.req.param('master')];
  const b = await c.req.json<Record<string, unknown>>();
  if (!String(b.name ?? '').trim()) return c.json({ error: 'name is required' }, 400);
  const id = uuid();
  const present = def.cols.filter((col) => b[col] != null && b[col] !== '');
  await c.env.DB.prepare(
    `INSERT INTO ${def.table} (id, mill_id${present.map((col) => `, ${col}`).join('')})
     VALUES (?, ?${present.map(() => ', ?').join('')})`,
  )
    .bind(id, mill.id, ...present.map((col) => b[col]))
    .run();
  return c.json({ id }, 201);
});

// ---- Night digest (free path: in-app + wa.me share text) ----
api.get('/digest', async (c) => {
  const { user, mill } = c.get('session');
  const db = c.env.DB;
  const today = istToday();
  const [gateRes, prodRes, payRes] = await db.batch([
    db.prepare(
      `SELECT direction, COUNT(*) AS trucks, SUM(MAX(COALESCE(gross_kg,0)-COALESCE(tare_kg,0),0)) AS net_kg
       FROM gate_entries WHERE mill_id = ?1 AND entry_date = ?2 AND status = 'done' GROUP BY direction`,
    ).bind(mill.id, today),
    db.prepare(`SELECT * FROM production_runs WHERE mill_id = ?1 AND run_date = ?2 ORDER BY created_at DESC LIMIT 1`).bind(mill.id, today),
    db.prepare(`SELECT COALESCE(SUM(amount_paise),0) AS paid FROM payments WHERE mill_id = ?1 AND pay_date = ?2 AND direction='paid'`).bind(mill.id, today),
  ]);
  const byDir: Record<string, { trucks: number; net_kg: number }> = {};
  for (const r of gateRes.results as { direction: string; trucks: number; net_kg: number }[]) byDir[r.direction] = r;
  const mb = massBalance((prodRes.results[0] as never) ?? null);
  const paid = (payRes.results[0] as { paid: number }).paid;
  const qtl = (kg: number) => (kg / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const lakh = (p: number) => `₹${(p / 10_000_000).toFixed(1)} L`;

  const lines = [
    `*${mill.name}* — Night Digest, ${today}`,
    `Paddy in: ${byDir.in?.trucks ?? 0} trucks · ${qtl(byDir.in?.net_kg ?? 0)} qtl`,
    `Dispatched: ${qtl(byDir.out?.net_kg ?? 0)} qtl`,
    ...(user.role !== 'manager' ? [`Cash paid: ${lakh(paid)}`] : []),
    mb.in_kg > 0 ? `Unexplained loss: ${mb.unexplained_pct}%${mb.unexplained_pct > mill.loss_limit_pct ? ` ⚠ above your ${mill.loss_limit_pct}% limit` : ''}` : 'No production entered today.',
    '— MillSaathi · पता चलेगा माल कहाँ जा रहा है।',
  ];
  const text = lines.join('\n');
  const body = {
    date: today,
    trucks_in: byDir.in?.trucks ?? 0,
    paddy_in_kg: byDir.in?.net_kg ?? 0,
    dispatched_kg: byDir.out?.net_kg ?? 0,
    cash_paid_paise: paid,
    mass_balance: mb,
    text,
    wa_share_url: `https://wa.me/?text=${encodeURIComponent(text)}`,
  };
  return c.json(user.role === 'manager' ? (stripMoney(body) as typeof body) : body);
});
