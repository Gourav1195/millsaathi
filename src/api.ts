// Business API. All routes here run behind requireAuth (see index.ts) and are scoped to
// the session's mill. Money is integer paise; weights are integer kg (UI shows quintals).
import { Hono } from 'hono';
import type { AppEnv } from './index';
import { hashPassword, hashToken } from './auth';

const printStyles = `<style>
  :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f3f5f7;color:#182230;font:14px/1.5 'IBM Plex Sans',Arial,sans-serif}.sheet{max-width:820px;margin:32px auto;padding:40px;background:#fff;box-shadow:0 12px 36px rgba(20,30,40,.12);border-top:7px solid #e8b93b}.brand{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid #e4e7ec;padding-bottom:22px}.brand h1{font:800 27px/1.1 Archivo,Arial,sans-serif;margin:0 0 6px}.muted{color:#667085}.label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#667085;font-weight:700}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:24px 0}.meta>div{background:#f7f8fa;border:1px solid #e4e7ec;border-radius:8px;padding:12px}.title{font:800 20px Archivo,Arial,sans-serif;margin:24px 0 8px}table{width:100%;border-collapse:collapse;margin-top:18px}th{background:#182230;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.05em;text-align:left}th,td{padding:11px 12px;border-bottom:1px solid #e4e7ec}td:last-child,th:last-child{text-align:right}.total{margin:20px 0 0 auto;max-width:270px;background:#fff8e1;border:1px solid #efd98d;border-radius:8px;padding:16px;display:flex;justify-content:space-between;font-weight:800;font-size:17px}.notes{margin-top:24px;padding-top:16px;border-top:1px solid #e4e7ec;white-space:pre-line}.actions{text-align:right;margin-bottom:14px}.actions button{border:0;border-radius:7px;padding:9px 14px;background:#c0451c;color:#fff;font-weight:700;cursor:pointer}@media(max-width:700px){body{background:#fff}.sheet{margin:0;padding:24px;box-shadow:none}.brand{display:block}.meta{grid-template-columns:1fr 1fr}}@media print{body{background:#fff}.sheet{margin:0;max-width:none;padding:0;box-shadow:none;border-top:0}.actions{display:none}}
</style>`;

// India runs the mill day on IST regardless of where the Worker executes.
export function istToday(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function shiftDate(dateText: string, days: number): string {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfWeek(dateText: string): string {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function shiftMonth(monthText: string, months: number): string {
  const [year, month] = monthText.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 7);
}

type TrendRange = 'daily' | 'weekly' | 'monthly';
function trendConfig(value: string | undefined): { range: TrendRange; start: string; buckets: string[]; label: string } {
  const today = istToday();
  if (value === 'monthly') {
    const current = today.slice(0, 7);
    const buckets = Array.from({ length: 12 }, (_, index) => shiftMonth(current, index - 11));
    return { range: 'monthly', start: `${buckets[0]}-01`, buckets, label: 'last 12 months' };
  }
  if (value === 'weekly') {
    const current = startOfWeek(today);
    const buckets = Array.from({ length: 5 }, (_, index) => shiftDate(current, (index - 4) * 7));
    return { range: 'weekly', start: buckets[0], buckets, label: 'last 5 weeks' };
  }
  const buckets = Array.from({ length: 7 }, (_, index) => istToday(index - 6));
  return { range: 'daily', start: buckets[0], buckets, label: 'last 7 days' };
}

function financialYearFor(dateText: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  const year = match ? Number(match[1]) : Number(istToday().slice(0, 4));
  const month = match ? Number(match[2]) : Number(istToday().slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function uuid(): string {
  return crypto.randomUUID();
} 

const UNIT_TO_KG: Record<string, number> = { KG: 1, QUINTAL: 100, TONNE: 1000 };
const DISPLAY_UNITS = ['KG', 'QUINTAL', 'TONNE', 'BAG', 'PIECE'];
function normalizeQuantity(quantity: unknown, unit: unknown): { quantity: number; unit: string; base: number; baseUnit: string } | null {
  const value = Number(quantity);
  const normalizedUnit = String(unit ?? 'KG').trim().toUpperCase();
  const multiplier = UNIT_TO_KG[normalizedUnit];
  if (!Number.isFinite(value) || value < 0 || !multiplier) return null;
  return { quantity: Math.round(value * 1000) / 1000, unit: normalizedUnit, base: Math.round(value * multiplier * 1000) / 1000, baseUnit: 'KG' };
}

function normalizeQuality(body: Record<string, unknown>): { json: string | null; error?: string } {
  const quality: Record<string, unknown> = {};
  for (const field of ['broken_pct', 'foreign_matter_pct', 'damaged_pct'] as const) {
    if (body[field] == null || body[field] === '') continue;
    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < 0 || value > 100) return { json: null, error: `${field} must be between 0 and 100` };
    quality[field] = Math.round(value * 10) / 10;
  }
  if (body.grade != null && String(body.grade).trim()) quality.grade = String(body.grade).trim().slice(0, 80);
  return { json: Object.keys(quality).length ? JSON.stringify(quality) : null };
}

async function normalizeItemQuantity(db: D1Database, millId: string, itemId: unknown, quantity: unknown, unit: unknown) {
  const normalizedUnit = String(unit ?? 'KG').trim().toUpperCase();
  const item = await db.prepare(`SELECT base_unit, package_unit, package_quantity_base FROM items WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(itemId, millId).first<{ base_unit: string | null; package_unit: string | null; package_quantity_base: number | null }>();
  if (!item) return null;
  const direct = normalizeQuantity(quantity, normalizedUnit);
  if (direct) return direct;
  if (!['BAG', 'PIECE'].includes(normalizedUnit) || String(item.package_unit ?? '').toUpperCase() !== normalizedUnit || !(Number(item.package_quantity_base) > 0)) return null;
  const value = Number(quantity);
  if (!Number.isFinite(value) || value < 0) return null;
  return { quantity: Math.round(value * 1000) / 1000, unit: normalizedUnit, base: Math.round(value * Number(item.package_quantity_base) * 1000) / 1000, baseUnit: item.base_unit || 'KG' };
}

async function audit(c: any, entityType: string, entityId: string, action: string, reason?: string) {
  await c.env.DB.prepare(`INSERT INTO audit_events (id, mill_id, actor_id, entity_type, entity_id, action, reason) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(uuid(), c.get('session').mill.id, c.get('session').user.id, entityType, entityId, action, reason || null).run();
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
const SUPPORT_ADMIN_EMAIL = 'gouravmodi1195@gmail.com';

function isSupportAdmin(user: { email: string }): boolean {
  return user.email.trim().toLowerCase() === SUPPORT_ADMIN_EMAIL;
}

type Permission = 'VIEW' | 'CREATE' | 'EDIT' | 'VOID' | 'MANAGE_MEMBERS' | 'MANAGE_ORGANISATION' | 'EXPORT';
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: ['VIEW', 'CREATE', 'EDIT', 'VOID', 'MANAGE_MEMBERS', 'MANAGE_ORGANISATION', 'EXPORT'],
  admin: ['VIEW', 'CREATE', 'EDIT', 'VOID', 'MANAGE_MEMBERS', 'MANAGE_ORGANISATION', 'EXPORT'],
  manager: ['VIEW', 'CREATE', 'EDIT', 'EXPORT'],
  accountant: ['VIEW', 'CREATE', 'EDIT', 'EXPORT'],
  gate_operator: ['VIEW', 'CREATE', 'EDIT'],
  production_operator: ['VIEW', 'CREATE', 'EDIT'],
  operator: ['VIEW', 'CREATE', 'EDIT'],
  viewer: ['VIEW'],
};
function effectiveRole(user: { role: string; role_code?: string | null }): string { return user.role_code || user.role; }
function hasPermission(user: { role: string; role_code?: string | null }, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[effectiveRole(user)] || []).includes(permission);
}
function denyUnless(c: any, permission: Permission): Response | null {
  return hasPermission(c.get('session').user, permission) ? null : c.json({ error: 'not allowed for this role' }, 403);
}

async function syncCompletedGate(c: any, gateId: string) {
  const { mill, user } = c.get('session');
  const db: D1Database = c.env.DB;
  const gate = await db.prepare(`SELECT id, sauda_id, direction, item_id, gross_kg, tare_kg, entry_date FROM gate_entries WHERE id = ? AND mill_id = ?`).bind(gateId, mill.id).first<{ id: string; sauda_id: string | null; direction: string; item_id: string | null; gross_kg: number | null; tare_kg: number | null; entry_date: string }>();
  const net = (gate?.gross_kg ?? 0) - (gate?.tare_kg ?? 0);
  if (!gate || net <= 0 || !gate.item_id) return;
  if (gate.sauda_id) {
    const existing = await db.prepare(`SELECT id FROM sauda_deliveries WHERE mill_id = ? AND gate_entry_id = ?`).bind(mill.id, gate.id).first();
    if (!existing) {
      const sauda = await db.prepare(`SELECT id, qty_kg, delivery_tolerance_pct FROM saudas WHERE id = ? AND mill_id = ?`).bind(gate.sauda_id, mill.id).first<{ id: string; qty_kg: number; delivery_tolerance_pct: number | null }>();
      if (sauda) {
        const delivered = await db.prepare(`SELECT COALESCE(SUM(actual_qty_base),0) AS quantity FROM sauda_deliveries WHERE sauda_id = ? AND mill_id = ? AND status = 'POSTED'`).bind(sauda.id, mill.id).first<{ quantity: number }>();
        const fulfilled = (delivered?.quantity || 0) + net;
        const warning = fulfilled > sauda.qty_kg * (1 + (sauda.delivery_tolerance_pct || 5) / 100);
        const deliveryId = uuid();
        await db.batch([
          db.prepare(`INSERT INTO sauda_deliveries (id, mill_id, sauda_id, gate_entry_id, actual_qty, actual_unit, actual_qty_base, actual_weight_kg, actual_date, notes) VALUES (?, ?, ?, ?, ?, 'KG', ?, ?, ?, ?)`)
            .bind(deliveryId, mill.id, sauda.id, gate.id, net, net, net, gate.entry_date, warning ? `Auto-recorded from completed ${gate.direction === 'out' ? 'outbound' : 'incoming'} gate; tolerance exceeded` : `Auto-recorded from completed ${gate.direction === 'out' ? 'outbound' : 'incoming'} gate`),
          db.prepare(`UPDATE saudas SET fulfilment_status = ? WHERE id = ? AND mill_id = ?`).bind(fulfilled >= sauda.qty_kg ? 'FULFILLED' : 'PARTIALLY_FULFILLED', sauda.id, mill.id),
        ]);
        await audit(c, 'sauda_delivery', deliveryId, 'CREATE', warning ? 'Delivery exceeds configured tolerance' : 'Created from completed gate entry');
      }
    }
  }
  if (gate.direction === 'out') {
    const movement = await db.prepare(`SELECT id FROM stock_movements WHERE mill_id = ? AND source_type = 'GATE' AND source_id = ?`).bind(mill.id, gate.id).first();
    if (!movement) {
      const movementId = uuid();
      await db.prepare(`INSERT INTO stock_movements (id, mill_id, direction, item_id, quantity, unit, quantity_base, base_unit, source_type, source_id, movement_date, created_by) VALUES (?, ?, 'OUT', ?, ?, 'KG', ?, 'KG', 'GATE', ?, ?, ?)`).bind(movementId, mill.id, gate.item_id, net, net, gate.id, gate.entry_date, user.id).run();
      await audit(c, 'stock_movement', movementId, 'CREATE', 'Created from completed outbound gate');
    }
  }
}

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

api.get('/billing/status', async (c) => {
  const denied = denyUnless(c, 'VIEW'); if (denied) return denied;
  const { mill } = c.get('session');
  const status = await c.env.DB.prepare(
    `SELECT ba.provider, bs.plan, bs.status, bs.current_period_start, bs.current_period_end
     FROM billing_accounts ba
     LEFT JOIN billing_subscriptions bs ON bs.billing_account_id = ba.id
       AND bs.status IN ('active', 'trialing', 'past_due')
     WHERE ba.mill_id = ? ORDER BY bs.created_at DESC LIMIT 1`,
  ).bind(mill.id).first<{ provider: string; plan: string | null; status: string | null; current_period_start: string | null; current_period_end: string | null }>();
  return c.json({ billing: { plan: status?.plan || 'free', status: status?.status || 'free', provider: status?.provider || null, current_period_start: status?.current_period_start || null, current_period_end: status?.current_period_end || null, checkout_available: false } });
});

// One round trip powers the whole SPA: batched reads, KPIs computed here.
api.get('/overview', async (c) => {
  const { user, mill } = c.get('session');
  const db = c.env.DB;
  const today = istToday();
  const weekAgo = istToday(-6);
  const trend = trendConfig(c.req.query('range'));
  const [gateColumnsRes, lotColumnsRes] = await db.batch([
    db.prepare(`PRAGMA table_info(gate_entries)`),
    db.prepare(`PRAGMA table_info(lots)`),
  ]);
  const gateColumns = new Set((gateColumnsRes.results as { name: string }[]).map((col) => col.name));
  const lotColumns = new Set((lotColumnsRes.results as { name: string }[]).map((col) => col.name));
  const hasStockReceiptFields = gateColumns.has('stock_status') && lotColumns.has('gate_entry_id');

  const [gateRes, gateWeekRes, saudasRes, lotsRes, godownsRes, suppliersRes, buyersRes, itemsRes, prodRes, payTodayRes, pendingReceiptsRes, rejectedReceiptsRes, activityRes] =
    await db.batch([
      db.prepare(
        `SELECT g.*, COALESCE(g.gross_kg,0)-COALESCE(g.tare_kg,0) AS net_kg,
                s.name AS supplier_name, b.name AS buyer_name, i.name AS item_name
         FROM gate_entries g
         LEFT JOIN suppliers s ON s.id = g.supplier_id
         LEFT JOIN buyers b ON b.id = g.buyer_id
         LEFT JOIN items i ON i.id = g.item_id
         WHERE g.mill_id = ?
         ORDER BY g.entry_date DESC, g.created_at DESC LIMIT 1000`,
      ).bind(mill.id),
      db.prepare(
        `SELECT entry_date, direction,
                SUM(MAX(COALESCE(gross_kg,0)-COALESCE(tare_kg,0),0)) AS net_kg
         FROM gate_entries WHERE mill_id = ?1 AND entry_date >= ?2
         GROUP BY entry_date, direction`,
      ).bind(mill.id, weekAgo),
      db.prepare(
        `SELECT sa.*, s.name AS supplier_name, b.name AS buyer_name, i.name AS item_name,
                sa.qty_kg * sa.rate_paise_per_qtl / 100 AS value_paise,
                CASE sa.commission_type WHEN 'fixed' THEN COALESCE(sa.commission_paise, 0) WHEN 'per_unit' THEN COALESCE(sa.commission_value, 0) * sa.qty_kg / 100 WHEN 'percentage' THEN (sa.qty_kg * sa.rate_paise_per_qtl / 100) * COALESCE(sa.commission_value, 0) / 100 ELSE 0 END AS commission_paise,
                COALESCE((SELECT SUM(d.actual_qty_base) FROM sauda_deliveries d WHERE d.sauda_id = sa.id AND d.mill_id = sa.mill_id AND d.status = 'POSTED'), 0) AS fulfilled_qty_base
         FROM saudas sa
         LEFT JOIN suppliers s ON s.id = sa.supplier_id
         LEFT JOIN buyers b ON b.id = sa.buyer_id
         LEFT JOIN items i ON i.id = sa.item_id
         WHERE sa.mill_id = ?1 ORDER BY sa.created_at DESC LIMIT 1000`,
      ).bind(mill.id),
      db.prepare(
        `SELECT l.*, gd.name AS godown_name, i.name AS item_name
         FROM lots l
         LEFT JOIN godowns gd ON gd.id = l.godown_id
         LEFT JOIN items i ON i.id = l.item_id
         WHERE l.mill_id = ?1 ORDER BY l.in_date DESC, l.code DESC LIMIT 1000`,
      ).bind(mill.id),
      db.prepare(
        `SELECT gd.*, CASE UPPER(COALESCE(gd.capacity_unit, 'QUINTAL')) WHEN 'KG' THEN COALESCE(gd.capacity_qty, gd.capacity_qtl * 100) WHEN 'QUINTAL' THEN COALESCE(gd.capacity_qty, gd.capacity_qtl) * 100 WHEN 'TONNE' THEN COALESCE(gd.capacity_qty, gd.capacity_qtl / 10) * 1000 ELSE NULL END AS capacity_kg,
                COALESCE((SELECT SUM(CASE WHEN sm.direction = 'IN' THEN sm.quantity_base WHEN sm.direction = 'OUT' THEN -sm.quantity_base ELSE sm.quantity_base END) FROM stock_movements sm WHERE sm.godown_id = gd.id AND sm.mill_id = gd.mill_id AND sm.status = 'POSTED'), 0) AS stock_kg
         FROM godowns gd WHERE gd.mill_id = ?1 AND gd.active = 1 ORDER BY gd.name`,
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
                         WHERE p.party_kind='supplier' AND p.party_id = s.id AND p.direction='paid' AND p.status = 'POSTED'), 0)
           ) AS outstanding_paise
         FROM suppliers s WHERE s.mill_id = ?1 AND s.deleted_at IS NULL ORDER BY s.name`,
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
                         WHERE p.party_kind='buyer' AND p.party_id = b.id AND p.direction='received' AND p.status = 'POSTED'), 0)
           ) AS receivable_paise
         FROM buyers b WHERE b.mill_id = ?1 AND b.deleted_at IS NULL ORDER BY b.name`,
      ).bind(mill.id),
      db.prepare(
        `SELECT i.*, COALESCE((SELECT SUM(CASE WHEN sm.direction = 'IN' THEN sm.quantity_base WHEN sm.direction = 'OUT' THEN -sm.quantity_base ELSE sm.quantity_base END) FROM stock_movements sm WHERE sm.item_id = i.id AND sm.mill_id = i.mill_id AND sm.status = 'POSTED'), 0) AS stock_kg
         FROM items i WHERE i.mill_id = ?1 AND i.deleted_at IS NULL ORDER BY i.category, i.name`,
      ).bind(mill.id),
      db.prepare(
        `SELECT * FROM production_runs WHERE mill_id = ?1 AND run_date >= ?2 ORDER BY run_date`,
      ).bind(mill.id, weekAgo),
      db.prepare(
        `SELECT direction, COALESCE(SUM(amount_paise),0) AS total
         FROM payments WHERE mill_id = ?1 AND pay_date = ?2 AND status = 'POSTED' GROUP BY direction`,
      ).bind(mill.id, today),
      hasStockReceiptFields
        ? db.prepare(
            `SELECT g.*, COALESCE(g.gross_kg,0)-COALESCE(g.tare_kg,0) AS net_kg,
                    s.name AS supplier_name, i.name AS item_name,
                    sa.code AS sauda_code, sa.rate_paise_per_qtl AS sauda_rate_paise_per_qtl
             FROM gate_entries g
             LEFT JOIN suppliers s ON s.id = g.supplier_id
             LEFT JOIN items i ON i.id = g.item_id
             LEFT JOIN saudas sa ON sa.id = g.sauda_id
             WHERE g.mill_id = ?1
               AND g.direction = 'in'
               AND g.status = 'done'
               AND g.stock_status = 'pending'
               AND COALESCE(g.gross_kg,0) > COALESCE(g.tare_kg,0)
               AND NOT EXISTS (SELECT 1 FROM lots l WHERE l.gate_entry_id = g.id)
             ORDER BY g.entry_date DESC, g.updated_at DESC
             LIMIT 20`,
          ).bind(mill.id)
        : db.prepare(`SELECT NULL AS id WHERE 0`),
      hasStockReceiptFields
        ? db.prepare(
            `SELECT g.*, COALESCE(g.gross_kg,0)-COALESCE(g.tare_kg,0) AS net_kg,
                    s.name AS supplier_name, i.name AS item_name
             FROM gate_entries g
             LEFT JOIN suppliers s ON s.id = g.supplier_id
             LEFT JOIN items i ON i.id = g.item_id
             WHERE g.mill_id = ?
               AND g.direction = 'in'
               AND g.status = 'done'
               AND g.stock_status = 'skipped'
               AND g.updated_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')
               AND NOT EXISTS (SELECT 1 FROM lots l WHERE l.gate_entry_id = g.id)
             ORDER BY g.updated_at DESC
             LIMIT 20`,
          ).bind(mill.id)
        : db.prepare(`SELECT NULL AS id WHERE 0`),
      db.prepare(
        `SELECT COUNT(*) AS gate_count,
                MIN(entry_date) AS first_gate_date
         FROM gate_entries WHERE mill_id = ?1`,
      ).bind(mill.id),
    ]);

  const stockSummaryRes = await db.prepare(
    `SELECT i.id AS item_id, i.name AS item_name, i.base_unit,
            COALESCE(SUM(CASE WHEN sm.direction = 'IN' THEN sm.quantity_base WHEN sm.direction = 'OUT' THEN -sm.quantity_base ELSE sm.quantity_base END), 0) AS quantity_base
     FROM items i LEFT JOIN stock_movements sm ON sm.item_id = i.id AND sm.mill_id = i.mill_id AND sm.status = 'POSTED'
     WHERE i.mill_id = ? AND i.deleted_at IS NULL GROUP BY i.id ORDER BY i.name`,
  ).bind(mill.id).all();
  const itemFlowRes = await db.prepare(
    `SELECT i.id AS item_id, i.name AS item_name, i.base_unit,
            COALESCE(SUM(CASE WHEN g.direction = 'in' THEN MAX(COALESCE(g.gross_kg,0)-COALESCE(g.tare_kg,0),0) ELSE 0 END),0) AS incoming_base,
            COALESCE(SUM(CASE WHEN g.direction = 'out' THEN MAX(COALESCE(g.gross_kg,0)-COALESCE(g.tare_kg,0),0) ELSE 0 END),0) AS outgoing_base
     FROM items i LEFT JOIN gate_entries g ON g.item_id = i.id AND g.mill_id = i.mill_id AND g.status = 'done' AND g.entry_date >= ?
     WHERE i.mill_id = ? AND i.deleted_at IS NULL GROUP BY i.id ORDER BY i.name`,
  ).bind(trend.start, mill.id).all();
  const processSummaryRes = await db.prepare(
    `SELECT l.line_type, COALESCE(SUM(l.quantity_base), 0) AS quantity_base, COUNT(DISTINCT l.run_id) AS run_count
     FROM process_run_lines l JOIN process_runs r ON r.id = l.run_id AND r.mill_id = l.mill_id
     WHERE l.mill_id = ? AND r.run_date >= ? AND r.status = 'POSTED' GROUP BY l.line_type`,
  ).bind(mill.id, trend.start).all();
  const processTodayRes = await db.prepare(
    `SELECT l.line_type, COALESCE(SUM(l.quantity_base), 0) AS quantity_base
     FROM process_run_lines l JOIN process_runs r ON r.id = l.run_id AND r.mill_id = l.mill_id
     WHERE l.mill_id = ? AND r.run_date = ? AND r.status = 'POSTED' GROUP BY l.line_type`,
  ).bind(mill.id, today).all();

  const gateAll = gateRes.results as Record<string, unknown>[];
  const gateToday = gateAll.filter((g) => g.entry_date === today);
  const prodRuns = prodRes.results as { run_date: string; paddy_in_kg: number; rice_out_kg: number; bran_out_kg: number; husk_out_kg: number; broken_out_kg: number }[];
  const todayRun = prodRuns.filter((r) => r.run_date === today).at(-1) ?? null;
  const mb = massBalance(todayRun);

  // Dashboard trend chart. The API returns a stable bucket shape for all three views.
  const trendMap = new Map<string, { in_kg: number; out_kg: number }>();
  trend.buckets.forEach((bucket) => trendMap.set(bucket, { in_kg: 0, out_kg: 0 }));
  for (const r of gateWeekRes.results as { entry_date: string; direction: string; net_kg: number }[]) {
    const bucket = trend.range === 'daily' ? r.entry_date : trend.range === 'weekly' ? startOfWeek(r.entry_date) : r.entry_date.slice(0, 7);
    const slot = trendMap.get(bucket);
    if (!slot) continue;
    if (r.direction === 'in') slot.in_kg = r.net_kg ?? 0;
    else slot.out_kg = r.net_kg ?? 0;
  }
  const trendData = [...trendMap.entries()].map(([date, v]) => ({ date, ...v }));

  const inToday = gateToday.filter((g) => g.direction === 'in');
  const outToday = gateToday.filter((g) => g.direction === 'out' && g.status === 'done');
  const doneIn = inToday.filter((g) => ['weighed', 'unloading', 'done'].includes(g.status as string));
  const queue = inToday.filter((g) => g.status !== 'done');
  const incomingTodayKg = doneIn.reduce((a, g) => a + Math.max(0, g.net_kg as number), 0);
  const outgoingTodayKg = outToday.reduce((a, g) => a + Math.max(0, g.net_kg as number), 0);
  const moistures = doneIn.map((g) => g.moisture_pct as number | null).filter((m): m is number => m != null);
  const avgMoisture = moistures.length ? Math.round((moistures.reduce((a, b) => a + b, 0) / moistures.length) * 10) / 10 : null;
  const labPending = inToday.filter((g) => g.status === 'in_lab').length;

  const payToday: Record<string, number> = {};
  for (const r of payTodayRes.results as { direction: string; total: number }[]) payToday[r.direction] = r.total;

  const saudas = saudasRes.results as Record<string, unknown>[];
  const lots = lotsRes.results as Record<string, unknown>[];
  const suppliers = suppliersRes.results as Record<string, unknown>[];
  const buyers = buyersRes.results as Record<string, unknown>[];
  const activity = (activityRes.results[0] ?? {}) as { gate_count?: number; first_gate_date?: string | null };

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
    const cap = Number(gd.capacity_kg) || 0;
    if (cap > 0 && (gd.stock_kg as number) / cap > 0.9) {
      alerts.push({ level: 'amber', title: `${gd.name} is ${Math.round(((gd.stock_kg as number) / cap) * 100)}% full`, body: 'Plan dispatches or transfers before it blocks unloading.' });
    }
  }
  if (labPending > 0) alerts.push({ level: 'amber', title: `${labPending} lab test${labPending > 1 ? 's' : ''} pending`, body: 'Trucks are waiting on moisture results at the lab.' });

  const body = {
    me: { id: user.id, name: user.name, email: user.email, role: effectiveRole(user), preferred_unit: user.preferred_unit || 'QUINTAL', theme: user.theme || 'light', permissions: ROLE_PERMISSIONS[effectiveRole(user)] || [] },
    mill: { id: mill.id, name: mill.name, address: mill.address, phone: mill.phone, email: mill.email, gstin: mill.gstin, place_of_supply: mill.place_of_supply, plan: mill.plan, loss_limit_pct: mill.loss_limit_pct, season_label: mill.season_label, created_at: mill.created_at },
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
      incoming_today_kg: incomingTodayKg,
      outgoing_today_kg: outgoingTodayKg,
      // Kept as compatibility aliases for older dashboard clients.
      paddy_in_today_kg: incomingTodayKg,
      rice_out_today_kg: outgoingTodayKg,
      avg_moisture: avgMoisture,
      lab_pending: labPending,
      payables_paise: payables,
      receivables_paise: receivables,
      advances_open_paise: advancesOpen,
    },
    mass_balance: mb,
    processing_today: processTodayRes.results,
    week: trendData,
    trend: { range: trend.range, label: trend.label, data: trendData },
    alerts,
    pending_receipts: pendingReceiptsRes.results,
    rejected_receipts: rejectedReceiptsRes.results,
    onboarding: { gate_count: activity.gate_count ?? 0, first_gate_date: activity.first_gate_date ?? null },
    gate: gateAll,
    saudas,
    lots,
    godowns: godownsRes.results,
    suppliers,
    buyers,
    items: itemsRes.results,
    stock_by_item: stockSummaryRes.results,
    item_flows: itemFlowRes.results,
    processing_summary: processSummaryRes.results,
    production: prodRuns,
  };

  return c.json(effectiveRole(user) === 'manager' ? (stripMoney(body) as typeof body) : body);
});

api.get('/organisation', async (c) => {
  const { user, mill } = c.get('session');
  if (!hasPermission(user, 'VIEW')) return c.json({ error: 'not allowed for this role' }, 403);
  return c.json({ organisation: { id: mill.id, name: mill.name, slug: mill.slug, address: mill.address || null, phone: mill.phone || null, email: mill.email || null, gstin: mill.gstin || null, place_of_supply: mill.place_of_supply || null } });
});

api.patch('/organisation', async (c) => {
  const denied = denyUnless(c, 'MANAGE_ORGANISATION'); if (denied) return denied;
  const { mill } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const name = String(b.name ?? '').trim();
  if (!name) return c.json({ error: 'organisation name is required' }, 400);
  const values = [name, String(b.address ?? '').trim() || null, String(b.phone ?? '').trim() || null, String(b.email ?? '').trim().toLowerCase() || null, String(b.gstin ?? '').trim().toUpperCase() || null, String(b.place_of_supply ?? '').trim() || null];
  await c.env.DB.prepare(`UPDATE mills SET name = ?, address = ?, phone = ?, email = ?, gstin = ?, place_of_supply = ? WHERE id = ?`).bind(...values, mill.id).run();
  await audit(c, 'organisation', mill.id, 'UPDATE');
  return c.json({ ok: true });
});

// ---- Gate & weighbridge workflow ----
api.post('/gate', async (c) => {
  const denied = denyUnless(c, 'CREATE'); if (denied) return denied;
  const { mill } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>();
  const direction = b.direction === 'out' ? 'out' : 'in';
  const vehicle = String(b.vehicle_no ?? '').trim().toUpperCase();
  if (!vehicle) return c.json({ error: 'vehicle_no is required' }, 400);
  if (direction === 'in' && !String(b.supplier_id ?? '').trim()) return c.json({ error: 'supplier_id is required for arriving movements' }, 400);
  if (direction === 'out' && !String(b.buyer_id ?? '').trim()) return c.json({ error: 'buyer_id is required for outgoing movements' }, 400);
  if (direction === 'in' && b.buyer_id) return c.json({ error: 'buyer_id is not valid for arriving movements' }, 400);
  if (direction === 'out' && b.supplier_id) return c.json({ error: 'supplier_id is not valid for outgoing movements' }, 400);
  const refs = await c.env.DB.batch([
    direction === 'in' ? c.env.DB.prepare(`SELECT id FROM suppliers WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(b.supplier_id, mill.id) : c.env.DB.prepare(`SELECT id FROM buyers WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(b.buyer_id, mill.id),
    b.item_id ? c.env.DB.prepare(`SELECT id FROM items WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(b.item_id, mill.id) : c.env.DB.prepare(`SELECT 1 AS id`),
  ]);
  if (!refs[0].results.length) return c.json({ error: 'party not found' }, 400);
  if (!refs[1].results.length) return c.json({ error: 'item not found' }, 400);
  if (b.sauda_id) {
    const sauda = await c.env.DB.prepare(`SELECT id, direction, item_id FROM saudas WHERE id = ? AND mill_id = ?`).bind(b.sauda_id, mill.id).first<{ id: string; direction: string; item_id: string | null }>();
    if (!sauda || sauda.direction !== direction || (sauda.item_id && sauda.item_id !== b.item_id)) return c.json({ error: 'sauda does not match this movement' }, 400);
  }
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
  await audit(c, 'gate_entry', id, 'CREATE');
  return c.json({ id, token_no: token }, 201);
});

api.patch('/gate/:id', async (c) => {
  const denied = denyUnless(c, 'EDIT'); if (denied) return denied;
  const { mill } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>();
  const currentGate = await c.env.DB.prepare(`SELECT direction, item_id, gross_kg, tare_kg, status FROM gate_entries WHERE id = ? AND mill_id = ?`).bind(c.req.param('id'), mill.id).first<{ direction: string; item_id: string | null; gross_kg: number | null; tare_kg: number | null; status: string }>();
  if (!currentGate) return c.json({ error: 'not found' }, 404);
  if (currentGate.status === 'done' && (b.gross_kg != null || b.tare_kg != null)) return c.json({ error: 'completed gate weights are immutable; record a correction separately' }, 409);
  for (const field of ['gross_kg', 'tare_kg', 'moisture_pct'] as const) if (b[field] != null && (!Number.isFinite(Number(b[field])) || Number(b[field]) < 0)) return c.json({ error: `${field} must be non-negative` }, 400);
  const quality = normalizeQuality(b);
  if (quality.error) return c.json({ error: quality.error }, 400);
  if (b.status === 'done' && currentGate.direction === 'out' && currentGate.item_id) {
    const net = Math.max(0, Number(b.gross_kg ?? currentGate.gross_kg ?? 0) - Number(b.tare_kg ?? currentGate.tare_kg ?? 0));
    if (net > 0) {
      const existing = await c.env.DB.prepare(`SELECT id FROM stock_movements WHERE mill_id = ? AND source_type = 'GATE' AND source_id = ?`).bind(mill.id, c.req.param('id')).first();
      if (!existing) {
        const available = await c.env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN quantity_base WHEN direction = 'OUT' THEN -quantity_base ELSE quantity_base END), 0) AS quantity FROM stock_movements WHERE mill_id = ? AND item_id = ? AND status = 'POSTED'`).bind(mill.id, currentGate.item_id).first<{ quantity: number }>();
        if ((available?.quantity || 0) < net) return c.json({ error: 'insufficient posted stock for this outbound gate' }, 400);
      }
    }
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const k of ['gross_kg', 'tare_kg', 'moisture_pct', 'rate_paise_per_qtl'] as const) {
    if (b[k] != null && Number.isFinite(Number(b[k]))) { sets.push(`${k} = ?`); vals.push(Number(b[k])); }
  }
  if (quality.json !== null || ['broken_pct', 'foreign_matter_pct', 'damaged_pct', 'grade'].some((field) => b[field] != null)) { sets.push('quality_json = ?'); vals.push(quality.json); }
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
  if (b.status === 'done') await syncCompletedGate(c, c.req.param('id'));
  await audit(c, 'gate_entry', c.req.param('id'), 'UPDATE');
  return c.json({ ok: true });
});

// ---- Saudas (owner/accountant only — managers never see rates) ----
api.post('/saudas', async (c) => {
  const denied = denyUnless(c, 'CREATE'); if (denied) return denied;
  const { user, mill } = c.get('session');
  if (!['owner', 'admin', 'accountant'].includes(effectiveRole(user))) return c.json({ error: 'not allowed for this role' }, 403);
  const b = await c.req.json<Record<string, unknown>>();
  const direction = String(b.direction ?? 'in');
  if (!['in', 'out'].includes(direction)) return c.json({ error: 'invalid sauda direction' }, 400);
  if (direction === 'in' && !String(b.supplier_id ?? '').trim()) return c.json({ error: 'supplier_id is required for purchase saudas' }, 400);
  if (direction === 'out' && !String(b.buyer_id ?? '').trim()) return c.json({ error: 'buyer_id is required for sales saudas' }, 400);
  const agreedQuantity = b.quantity != null ? b.quantity : b.qty_kg;
  const agreedUnit = b.quantity != null ? (b.unit || 'QUINTAL') : 'KG';
  const agreedRate = Number(b.rate_paise_per_qtl);
  const normalizedAgreement = b.item_id
    ? await normalizeItemQuantity(c.env.DB, mill.id, b.item_id, agreedQuantity, agreedUnit)
    : normalizeQuantity(agreedQuantity, agreedUnit);
  if (!normalizedAgreement || normalizedAgreement.base <= 0) return c.json({ error: 'positive quantity and a supported unit are required' }, 400);
  if (!Number.isFinite(agreedRate) || agreedRate < 0) return c.json({ error: 'rate_paise_per_qtl must be non-negative' }, 400);
  const commissionType = String(b.commission_type ?? '').trim().toLowerCase();
  if (commissionType && !['fixed', 'per_unit', 'percentage'].includes(commissionType)) return c.json({ error: 'invalid commission type' }, 400);
  const commissionValue = commissionType ? Number(b.commission_value) : 0;
  if (commissionType && (!Number.isFinite(commissionValue) || commissionValue < 0)) return c.json({ error: 'commission value must be non-negative' }, 400);
  const deliveryStart = String(b.delivery_start ?? '').trim() || null;
  const deliveryEnd = String(b.delivery_end ?? '').trim() || null;
  if (deliveryStart && deliveryEnd && deliveryStart > deliveryEnd) return c.json({ error: 'delivery start must be before delivery end' }, 400);
  const deliveryTolerance = b.delivery_tolerance_pct == null ? 5 : Number(b.delivery_tolerance_pct);
  if (!Number.isFinite(deliveryTolerance) || deliveryTolerance < 0 || deliveryTolerance > 100) return c.json({ error: 'delivery tolerance must be between 0 and 100 percent' }, 400);
  const party = direction === 'in'
    ? await c.env.DB.prepare(`SELECT id FROM suppliers WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(b.supplier_id, mill.id).first()
    : await c.env.DB.prepare(`SELECT id FROM buyers WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(b.buyer_id, mill.id).first();
  if (!party) return c.json({ error: 'party not found' }, 400);
  if (b.item_id && !await c.env.DB.prepare(`SELECT id FROM items WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(b.item_id, mill.id).first()) return c.json({ error: 'item not found' }, 400);
  const code = await nextCode(c.env.DB, mill.id, 'sauda', 'SAU');
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO saudas (id, mill_id, code, direction, supplier_id, buyer_id, broker_name, item_id, qty_kg, agreed_quantity, agreed_unit, rate_paise_per_qtl, moisture_pct, advance_paise, note, agreement_date, delivery_start, delivery_end, delivery_tolerance_pct, commission_type, commission_value, commission_paise)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, mill.id, code, direction, (b.supplier_id as string) || null, (b.buyer_id as string) || null, String(b.broker_name ?? 'Direct'),
      (b.item_id as string) || null, Math.round(normalizedAgreement.base), normalizedAgreement.quantity, normalizedAgreement.unit, Math.round(agreedRate),
      b.moisture_pct != null ? Number(b.moisture_pct) : null, Math.round(Number(b.advance_paise) || 0), (b.note as string) || null, String(b.agreement_date ?? istToday()), deliveryStart, deliveryEnd, deliveryTolerance, commissionType || null, commissionType === 'percentage' || commissionType === 'per_unit' ? commissionValue : null, commissionType === 'fixed' ? Math.round(commissionValue * 100) : null)
    .run();
  return c.json({ id, code }, 201);
});

api.patch('/saudas/:id', async (c) => {
  const denied = denyUnless(c, 'EDIT'); if (denied) return denied;
  const { user, mill } = c.get('session');
  if (!['owner', 'admin', 'accountant'].includes(effectiveRole(user))) return c.json({ error: 'not allowed for this role' }, 403);
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
  const denied = denyUnless(c, 'CREATE'); if (denied) return denied;
  const { mill } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>();
  const requestedQuantity = b.quantity != null ? b.quantity : b.qty_kg;
  const requestedUnit = b.unit != null ? b.unit : 'KG';
  const lotEntry = b.item_id
    ? await normalizeItemQuantity(c.env.DB, mill.id, b.item_id, requestedQuantity, requestedUnit)
    : normalizeQuantity(requestedQuantity, requestedUnit);
  if (!lotEntry || lotEntry.base <= 0) return c.json({ error: 'positive quantity and a supported unit are required' }, 400);
  const lotQuantity = lotEntry.base;
  const lotValue = b.value_paise == null ? 0 : Number(b.value_paise);
  if (!Number.isFinite(lotQuantity) || lotQuantity <= 0 || Math.round(lotQuantity) <= 0) return c.json({ error: 'qty_kg must be positive' }, 400);
  if (!Number.isFinite(lotValue) || lotValue < 0) return c.json({ error: 'value_paise must be non-negative' }, 400);
  if (b.moisture_pct != null && (!Number.isFinite(Number(b.moisture_pct)) || Number(b.moisture_pct) < 0 || Number(b.moisture_pct) > 100)) return c.json({ error: 'moisture_pct must be between 0 and 100' }, 400);
  if (b.item_id && !await c.env.DB.prepare(`SELECT id FROM items WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(b.item_id, mill.id).first()) return c.json({ error: 'item not found' }, 400);
  if (b.godown_id && !await c.env.DB.prepare(`SELECT id FROM godowns WHERE id = ? AND mill_id = ? AND active = 1`).bind(b.godown_id, mill.id).first()) return c.json({ error: 'godown not found' }, 400);
  const code = await nextCode(c.env.DB, mill.id, 'lot', 'LOT');
  const id = uuid();
  const gateEntryId = (b.gate_entry_id as string) || null;
  const [lotColumnsRes, gateColumnsRes] = await c.env.DB.batch([
    c.env.DB.prepare(`PRAGMA table_info(lots)`),
    c.env.DB.prepare(`PRAGMA table_info(gate_entries)`),
  ]);
  const lotColumns = new Set((lotColumnsRes.results as { name: string }[]).map((col) => col.name));
  const gateColumns = new Set((gateColumnsRes.results as { name: string }[]).map((col) => col.name));
  const canLinkGate = lotColumns.has('gate_entry_id') && gateColumns.has('stock_status');
  if (gateEntryId && !canLinkGate) return c.json({ error: 'Stock receipt helper needs the latest database migration.' }, 503);

  const lotQuality = normalizeQuality(b);
  if (lotQuality.error) return c.json({ error: lotQuality.error }, 400);
  const columns = ['id', 'mill_id', 'code', 'godown_id', 'item_id', 'qty_kg', 'moisture_pct', 'value_paise', 'in_date', 'quality_json'];
  const values: unknown[] = [
    id, mill.id, code, (b.godown_id as string) || null, (b.item_id as string) || null,
    Math.round(lotQuantity), b.moisture_pct != null ? Number(b.moisture_pct) : null,
    Math.round(lotValue), (b.in_date as string) || istToday(), lotQuality.json,
  ];
  if (lotColumns.has('entered_quantity')) { columns.push('entered_quantity'); values.push(lotEntry.quantity); }
  if (lotColumns.has('entered_unit')) { columns.push('entered_unit'); values.push(lotEntry.unit); }
  if (lotColumns.has('gate_entry_id')) {
    columns.splice(3, 0, 'gate_entry_id');
    values.splice(3, 0, gateEntryId);
  }
  if (lotColumns.has('note')) {
    columns.push('note');
    values.push((b.note as string) || null);
  }
  const inserts = c.env.DB.prepare(
    `INSERT INTO lots (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  ).bind(...values);
  const stockInsert = b.item_id ? c.env.DB.prepare(`INSERT INTO stock_movements (id, mill_id, direction, item_id, godown_id, lot_id, quantity, unit, quantity_base, base_unit, source_type, source_id, movement_date, created_by) VALUES (?, ?, 'IN', ?, ?, ?, ?, ?, ?, ?, 'LOT', ?, ?, ?)`).bind(uuid(), mill.id, b.item_id, b.godown_id || null, id, lotEntry.quantity, lotEntry.unit, lotEntry.base, lotEntry.baseUnit, id, b.in_date || istToday(), c.get('session').user.id) : null;
  if (gateEntryId) {
    const gate = await c.env.DB.prepare(
      `SELECT id, quality_json FROM gate_entries
       WHERE id = ?1 AND mill_id = ?2 AND direction = 'in' AND status = 'done' AND stock_status = 'pending'`,
    ).bind(gateEntryId, mill.id).first<{ id: string; quality_json: string | null }>();
    if (!gate) return c.json({ error: 'incoming truck is not pending for stock' }, 400);
    if (!lotQuality.json && gate.quality_json) values[columns.indexOf('quality_json')] = gate.quality_json;
    await c.env.DB.batch([
      inserts, ...(stockInsert ? [stockInsert] : []),
      c.env.DB.prepare(`UPDATE gate_entries SET stock_status = 'added', stock_note = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND mill_id = ?`)
        .bind((b.note as string) || null, gateEntryId, mill.id),
      c.env.DB.prepare(`UPDATE sauda_deliveries SET lot_id = ?, godown_id = ? WHERE mill_id = ? AND gate_entry_id = ? AND lot_id IS NULL`)
        .bind(id, (b.godown_id as string) || null, mill.id, gateEntryId),
    ]);
  } else {
    if (stockInsert) await c.env.DB.batch([inserts, stockInsert]); else await inserts.run();
  }
  return c.json({ id, code }, 201);
});

api.post('/saudas/:id/deliveries', async (c) => {
  const denied = denyUnless(c, 'CREATE'); if (denied) return denied;
  const { mill } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const sauda = await c.env.DB.prepare(`SELECT id, direction, item_id, qty_kg, delivery_tolerance_pct FROM saudas WHERE id = ? AND mill_id = ?`).bind(c.req.param('id'), mill.id).first<{ id: string; direction: string; item_id: string | null; qty_kg: number; delivery_tolerance_pct: number }>();
  if (!sauda) return c.json({ error: 'sauda not found' }, 404);
  if (b.gate_entry_id) {
    const linkedGate = await c.env.DB.prepare(`SELECT id, sauda_id, direction, item_id FROM gate_entries WHERE id = ? AND mill_id = ?`).bind(b.gate_entry_id, mill.id).first<{ id: string; sauda_id: string | null; direction: string; item_id: string | null }>();
    if (!linkedGate) return c.json({ error: 'gate entry not found' }, 400);
    if (await c.env.DB.prepare(`SELECT id FROM sauda_deliveries WHERE gate_entry_id = ? AND mill_id = ?`).bind(b.gate_entry_id, mill.id).first()) return c.json({ error: 'this gate entry already has a Sauda delivery' }, 409);
    if (linkedGate.sauda_id && linkedGate.sauda_id !== sauda.id) return c.json({ error: 'gate entry belongs to another sauda' }, 400);
    if (linkedGate.direction !== sauda.direction || (sauda.item_id && linkedGate.item_id !== sauda.item_id)) return c.json({ error: 'gate entry does not match this sauda' }, 400);
  }
  if (b.godown_id && !await c.env.DB.prepare(`SELECT id FROM godowns WHERE id = ? AND mill_id = ? AND active = 1`).bind(b.godown_id, mill.id).first()) return c.json({ error: 'godown not found' }, 400);
  const q = sauda.item_id
    ? await normalizeItemQuantity(c.env.DB, mill.id, sauda.item_id, b.actual_qty, b.actual_unit || 'KG')
    : normalizeQuantity(b.actual_qty, b.actual_unit || 'KG');
  if (!q || q.base <= 0) return c.json({ error: 'actual_qty and a supported unit are required' }, 400);
  if (b.actual_weight_kg != null && (!Number.isFinite(Number(b.actual_weight_kg)) || Number(b.actual_weight_kg) < 0)) return c.json({ error: 'actual_weight_kg must be non-negative' }, 400);
  const delivered = await c.env.DB.prepare(`SELECT COALESCE(SUM(actual_qty_base),0) AS quantity FROM sauda_deliveries WHERE sauda_id = ? AND mill_id = ? AND status = 'POSTED'`).bind(sauda.id, mill.id).first<{ quantity: number }>();
  const fulfilled = (delivered?.quantity || 0) + q.base;
  const warning = fulfilled > sauda.qty_kg * (1 + (sauda.delivery_tolerance_pct || 5) / 100);
  const deliveryId = uuid();
  await c.env.DB.prepare(`INSERT INTO sauda_deliveries (id, mill_id, sauda_id, gate_entry_id, actual_qty, actual_unit, actual_qty_base, actual_weight_kg, actual_date, godown_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(deliveryId, mill.id, sauda.id, String(b.gate_entry_id ?? '') || null, q.quantity, q.unit, q.base, b.actual_weight_kg == null ? null : Math.round(Number(b.actual_weight_kg)), String(b.actual_date ?? istToday()), String(b.godown_id ?? '') || null, String(b.notes ?? '') || null).run();
  const status = fulfilled >= sauda.qty_kg ? 'FULFILLED' : 'PARTIALLY_FULFILLED';
  await c.env.DB.prepare(`UPDATE saudas SET fulfilment_status = ? WHERE id = ? AND mill_id = ?`).bind(status, sauda.id, mill.id).run();
  await audit(c, 'sauda_delivery', deliveryId, 'CREATE', warning ? 'Delivery exceeds configured tolerance' : undefined);
  return c.json({ id: deliveryId, fulfilled_quantity_base: fulfilled, remaining_quantity_base: Math.max(0, sauda.qty_kg - fulfilled), warning, status }, 201);
});

api.get('/saudas/:id/deliveries', async (c) => {
  const { mill } = c.get('session');
  const sauda = await c.env.DB.prepare(`SELECT id FROM saudas WHERE id = ? AND mill_id = ?`).bind(c.req.param('id'), mill.id).first();
  if (!sauda) return c.json({ error: 'sauda not found' }, 404);
  const rows = await c.env.DB.prepare(
    `SELECT d.*, g.token_no, g.vehicle_no, l.code AS lot_code
     FROM sauda_deliveries d
     LEFT JOIN gate_entries g ON g.id = d.gate_entry_id AND g.mill_id = d.mill_id
     LEFT JOIN lots l ON l.id = d.lot_id AND l.mill_id = d.mill_id
     WHERE d.sauda_id = ? AND d.mill_id = ? ORDER BY d.actual_date DESC, d.created_at DESC`,
  ).bind(c.req.param('id'), mill.id).all();
  return c.json({ deliveries: rows.results });
});

api.post('/sauda-deliveries/:id/void', async (c) => {
  const denied = denyUnless(c, 'VOID'); if (denied) return denied;
  const { mill, user } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const reason = String(b.reason ?? '').trim();
  if (reason.length < 3) return c.json({ error: 'a void reason is required' }, 400);
  const delivery = await c.env.DB.prepare(
    `SELECT id, sauda_id, gate_entry_id, actual_qty_base
     FROM sauda_deliveries WHERE id = ? AND mill_id = ? AND status = 'POSTED'`,
  ).bind(c.req.param('id'), mill.id).first<{ id: string; sauda_id: string; gate_entry_id: string | null; actual_qty_base: number }>();
  if (!delivery) return c.json({ error: 'posted delivery not found' }, 404);
  if (delivery.gate_entry_id) return c.json({ error: 'gate-linked deliveries cannot be voided; correct the gate record separately' }, 409);
  const sauda = await c.env.DB.prepare(`SELECT qty_kg FROM saudas WHERE id = ? AND mill_id = ?`).bind(delivery.sauda_id, mill.id).first<{ qty_kg: number }>();
  if (!sauda) return c.json({ error: 'sauda not found' }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE sauda_deliveries SET status = 'VOID', voided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), voided_by = ? WHERE id = ? AND mill_id = ? AND status = 'POSTED'`).bind(user.id, delivery.id, mill.id),
    c.env.DB.prepare(`UPDATE saudas SET fulfilment_status = CASE
      WHEN COALESCE((SELECT SUM(actual_qty_base) FROM sauda_deliveries WHERE sauda_id = ? AND mill_id = ? AND status = 'POSTED'), 0) >= qty_kg THEN 'FULFILLED'
      WHEN COALESCE((SELECT SUM(actual_qty_base) FROM sauda_deliveries WHERE sauda_id = ? AND mill_id = ? AND status = 'POSTED'), 0) > 0 THEN 'PARTIALLY_FULFILLED'
      ELSE 'OPEN' END WHERE id = ? AND mill_id = ?`).bind(delivery.sauda_id, mill.id, delivery.sauda_id, mill.id, delivery.sauda_id, mill.id),
  ]);
  await audit(c, 'sauda_delivery', delivery.id, 'VOID', reason);
  return c.json({ ok: true });
});

api.patch('/lots/:id', async (c) => {
  const denied = denyUnless(c, 'EDIT'); if (denied) return denied;
  const { mill } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>();
  const lot = await c.env.DB.prepare(`SELECT id, item_id, godown_id, qty_kg FROM lots WHERE id = ? AND mill_id = ?`).bind(c.req.param('id'), mill.id).first<{ id: string; item_id: string | null; godown_id: string | null; qty_kg: number }>();
  if (!lot) return c.json({ error: 'not found' }, 404);
  if (typeof b.item_id === 'string' && b.item_id && b.item_id !== lot.item_id) return c.json({ error: 'lot item cannot be changed after creation' }, 400);
  if (typeof b.item_id === 'string' && b.item_id && !await c.env.DB.prepare(`SELECT id FROM items WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(b.item_id, mill.id).first()) return c.json({ error: 'item not found' }, 400);
  if (typeof b.godown_id === 'string' && b.godown_id && !await c.env.DB.prepare(`SELECT id FROM godowns WHERE id = ? AND mill_id = ? AND active = 1`).bind(b.godown_id, mill.id).first()) return c.json({ error: 'godown not found' }, 400);
  const [lotColumnsRes] = await c.env.DB.batch([c.env.DB.prepare(`PRAGMA table_info(lots)`)]);
  const lotColumns = new Set((lotColumnsRes.results as { name: string }[]).map((col) => col.name));
  const sets: string[] = [];
  const vals: unknown[] = [];
  const targetGodown = typeof b.godown_id === 'string' ? (b.godown_id || null) : lot.godown_id;
  let targetQuantity = lot.qty_kg;
  let enteredQuantity: number | null = null;
  let enteredUnit: string | null = null;
  if (b.quantity != null || b.unit != null) {
    const q = lot.item_id
      ? await normalizeItemQuantity(c.env.DB, mill.id, lot.item_id, b.quantity, b.unit || 'KG')
      : normalizeQuantity(b.quantity, b.unit || 'KG');
    if (!q || q.base <= 0) return c.json({ error: 'positive quantity and a supported unit are required' }, 400);
    targetQuantity = Math.round(q.base);
    enteredQuantity = q.quantity;
    enteredUnit = q.unit;
  } else if (b.qty_kg != null) {
    if (!Number.isFinite(Number(b.qty_kg)) || Number(b.qty_kg) <= 0) return c.json({ error: 'qty_kg must be positive' }, 400);
    targetQuantity = Math.round(Number(b.qty_kg));
  }
  if (b.moisture_pct != null && (!Number.isFinite(Number(b.moisture_pct)) || Number(b.moisture_pct) < 0 || Number(b.moisture_pct) > 100)) return c.json({ error: 'moisture_pct must be between 0 and 100' }, 400);
  if (b.value_paise != null && (!Number.isFinite(Number(b.value_paise)) || Number(b.value_paise) < 0)) return c.json({ error: 'value_paise must be non-negative' }, 400);
  const lotQuality = normalizeQuality(b);
  if (lotQuality.error) return c.json({ error: lotQuality.error }, 400);
  if (typeof b.godown_id === 'string') { sets.push('godown_id = ?'); vals.push(b.godown_id || null); }
  if (b.quantity != null || b.unit != null || b.qty_kg != null) {
    sets.push('qty_kg = ?'); vals.push(targetQuantity);
    if (lotColumns.has('entered_quantity') && enteredQuantity != null) { sets.push('entered_quantity = ?'); vals.push(enteredQuantity); }
    if (lotColumns.has('entered_unit') && enteredUnit != null) { sets.push('entered_unit = ?'); vals.push(enteredUnit); }
  }
  if (b.moisture_pct === null || Number.isFinite(Number(b.moisture_pct))) { sets.push('moisture_pct = ?'); vals.push(b.moisture_pct === null ? null : Number(b.moisture_pct)); }
  if (b.value_paise != null && Number.isFinite(Number(b.value_paise))) { sets.push('value_paise = ?'); vals.push(Math.round(Number(b.value_paise))); }
  if (lotColumns.has('note') && typeof b.note === 'string') { sets.push('note = ?'); vals.push(b.note.trim() || null); }
  if (lotColumns.has('quality_json') && (lotQuality.json !== null || ['broken_pct', 'foreign_matter_pct', 'damaged_pct', 'grade'].some((field) => b[field] != null))) { sets.push('quality_json = ?'); vals.push(lotQuality.json); }
  if (!sets.length) return c.json({ error: 'nothing to update' }, 400);
  const statements: D1PreparedStatement[] = [c.env.DB.prepare(`UPDATE lots SET ${sets.join(', ')} WHERE id = ? AND mill_id = ?`).bind(...vals, c.req.param('id'), mill.id)];
  if (lot.item_id && (targetQuantity !== lot.qty_kg || targetGodown !== lot.godown_id)) {
    const movementDate = istToday();
    if (lot.qty_kg > 0) statements.push(c.env.DB.prepare(`INSERT INTO stock_movements (id, mill_id, direction, item_id, godown_id, lot_id, quantity, unit, quantity_base, base_unit, source_type, source_id, movement_date, created_by) VALUES (?, ?, 'OUT', ?, ?, ?, ?, 'KG', ?, 'KG', 'LOT_EDIT', ?, ?, ?)`).bind(uuid(), mill.id, lot.item_id, lot.godown_id, lot.id, lot.qty_kg, lot.qty_kg, lot.id, movementDate, c.get('session').user.id));
    if (targetQuantity > 0) statements.push(c.env.DB.prepare(`INSERT INTO stock_movements (id, mill_id, direction, item_id, godown_id, lot_id, quantity, unit, quantity_base, base_unit, source_type, source_id, movement_date, created_by) VALUES (?, ?, 'IN', ?, ?, ?, ?, 'KG', ?, 'KG', 'LOT_EDIT', ?, ?, ?)`).bind(uuid(), mill.id, lot.item_id, targetGodown, lot.id, targetQuantity, targetQuantity, lot.id, movementDate, c.get('session').user.id));
  }
  await c.env.DB.batch(statements);
  await audit(c, 'lot', lot.id, 'UPDATE', (targetQuantity !== lot.qty_kg || targetGodown !== lot.godown_id) ? 'Lot quantity or godown change posted to stock ledger' : undefined);
  return c.json({ ok: true });
});

api.post('/stock-receipts/:id/skip', async (c) => {
  const denied = denyUnless(c, 'EDIT'); if (denied) return denied;
  const { mill } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const res = await c.env.DB.prepare(
    `UPDATE gate_entries
     SET stock_status = 'skipped', stock_note = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ? AND mill_id = ? AND direction = 'in' AND status = 'done' AND stock_status = 'pending'`,
  )
    .bind((b.note as string) || null, c.req.param('id'), mill.id)
    .run();
  if (!res.meta.changes) return c.json({ error: 'incoming truck is not pending for stock' }, 404);
  return c.json({ ok: true });
});

api.post('/stock-receipts/:id/reopen', async (c) => {
  const denied = denyUnless(c, 'EDIT'); if (denied) return denied;
  const { mill } = c.get('session');
  const res = await c.env.DB.prepare(
    `UPDATE gate_entries
     SET stock_status = 'pending', stock_note = 'Reopened for stock receipt', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ? AND mill_id = ? AND direction = 'in' AND status = 'done' AND stock_status = 'skipped'
       AND updated_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')
       AND NOT EXISTS (SELECT 1 FROM lots l WHERE l.gate_entry_id = gate_entries.id)`,
  ).bind(c.req.param('id'), mill.id).run();
  if (!res.meta.changes) return c.json({ error: 'this rejected truck can no longer be reopened' }, 409);
  return c.json({ ok: true });
});

api.post('/production', async (c) => {
  const denied = denyUnless(c, 'CREATE'); if (denied) return denied;
  const { mill } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>();
  const productionFields = ['paddy_in_kg', 'rice_out_kg', 'bran_out_kg', 'husk_out_kg', 'broken_out_kg'] as const;
  if (productionFields.some((field) => b[field] != null && (!Number.isFinite(Number(b[field])) || Number(b[field]) < 0))) return c.json({ error: 'production quantities must be non-negative' }, 400);
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
  await audit(c, 'production_run', id, 'CREATE');
  return c.json({ id }, 201);
});

// ---- Payments (owner/accountant only) ----
api.post('/payments', async (c) => {
  const denied = denyUnless(c, 'CREATE'); if (denied) return denied;
  const { user, mill } = c.get('session');
  if (!['owner', 'admin', 'accountant'].includes(effectiveRole(user))) return c.json({ error: 'not allowed for this role' }, 403);
  const b = await c.req.json<Record<string, unknown>>();
  const amount = Math.round(Number(b.amount_paise) || 0);
  if (amount <= 0) return c.json({ error: 'amount_paise must be positive' }, 400);
  if (b.party_kind !== 'supplier' && b.party_kind !== 'buyer') return c.json({ error: 'invalid party_kind' }, 400);
  const partyTable = b.party_kind === 'supplier' ? 'suppliers' : 'buyers';
  if (!await c.env.DB.prepare(`SELECT id FROM ${partyTable} WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(b.party_id, mill.id).first()) return c.json({ error: 'party not found' }, 400);
  const documentId = String(b.document_id ?? '') || null;
  if (documentId && !await c.env.DB.prepare(`SELECT id FROM documents WHERE id = ? AND mill_id = ? AND party_kind = ? AND party_id = ? AND status = 'POSTED'`).bind(documentId, mill.id, b.party_kind, b.party_id).first()) return c.json({ error: 'invoice not found for this party' }, 400);
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO payments (id, mill_id, party_kind, party_id, direction, amount_paise, method, note, pay_date, document_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, mill.id, b.party_kind, String(b.party_id ?? ''),
      b.party_kind === 'supplier' ? 'paid' : 'received', amount,
      (b.method as string) || 'cash', (b.note as string) || null, (b.pay_date as string) || istToday(), documentId)
    .run();
  await audit(c, 'payment', id, 'CREATE');
  return c.json({ id }, 201);
});

api.post('/payments/:id/void', async (c) => {
  const denied = denyUnless(c, 'VOID'); if (denied) return denied;
  const { user, mill } = c.get('session');
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const reason = String(body.reason ?? '').trim();
  if (reason.length < 3) return c.json({ error: 'a void reason is required' }, 400);
  const result = await c.env.DB.prepare(`UPDATE payments SET status = 'VOID', voided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), voided_by = ? WHERE id = ? AND mill_id = ? AND status = 'POSTED'`).bind(user.id, c.req.param('id'), mill.id).run();
  if (!result.meta.changes) return c.json({ error: 'posted payment not found' }, 404);
  await audit(c, 'payment', c.req.param('id'), 'VOID', reason);
  return c.json({ ok: true });
});

api.get('/payments', async (c) => {
  const { user, mill } = c.get('session');
  const result = await c.env.DB.prepare(`SELECT p.id, p.party_kind, p.party_id, p.direction, p.amount_paise, p.method, p.note, p.pay_date, p.status, p.created_at, COALESCE(s.name, b.name) AS party_name FROM payments p LEFT JOIN suppliers s ON p.party_kind = 'supplier' AND s.id = p.party_id AND s.mill_id = p.mill_id LEFT JOIN buyers b ON p.party_kind = 'buyer' AND b.id = p.party_id AND b.mill_id = p.mill_id WHERE p.mill_id = ? ORDER BY p.pay_date DESC, p.created_at DESC LIMIT 1000`).bind(mill.id).all<Record<string, unknown>>();
  const body = { payments: result.results };
  return c.json(user.role_code === 'manager' || user.role === 'manager' ? stripMoney(body) : body);
});

api.get('/payments/:id/print', async (c) => {
  const denied = denyUnless(c, 'EXPORT'); if (denied) return denied;
  const { user, mill } = c.get('session');
  const payment = await c.env.DB.prepare(`SELECT p.*, COALESCE(s.name, b.name) AS party_name, COALESCE(s.address, b.address) AS party_address, COALESCE(s.phone, b.phone) AS party_phone FROM payments p LEFT JOIN suppliers s ON p.party_kind = 'supplier' AND s.id = p.party_id AND s.mill_id = p.mill_id LEFT JOIN buyers b ON p.party_kind = 'buyer' AND b.id = p.party_id AND b.mill_id = p.mill_id WHERE p.id = ? AND p.mill_id = ?`).bind(c.req.param('id'), mill.id).first<Record<string, unknown>>();
  if (!payment) return c.html('<h1>Receipt not found</h1>', 404);
  const escHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[ch]);
  const amount = (Number(payment.amount_paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const direction = payment.direction === 'paid' ? 'Payment made to supplier' : 'Receipt received from buyer';
  return c.html(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt · ${escHtml(mill.name)}</title>${printStyles}</head><body><main class="sheet"><div class="actions"><button onclick="print()">Print / Save PDF</button></div><div class="brand"><div><h1>${escHtml(mill.name)}</h1><div class="muted">${escHtml(mill.address || '')}${mill.phone ? ` · ${escHtml(mill.phone)}` : ''}</div></div><div class="label">MillSaathi</div></div><h2 class="title">Payment receipt</h2><div class="meta"><div><div class="label">Receipt date</div><strong>${escHtml(payment.pay_date)}</strong></div><div><div class="label">Party</div><strong>${escHtml(payment.party_name)}</strong></div><div><div class="label">Method</div><strong>${escHtml(payment.method)}</strong></div></div><table><tbody><tr><td>Transaction</td><td>${escHtml(direction)}</td></tr><tr><td>Amount</td><td>₹${escHtml(amount)}</td></tr><tr><td>Note</td><td>${escHtml(payment.note || '—')}</td></tr></tbody></table><div class="total"><span>Total</span><span>₹${escHtml(amount)}</span></div><p class="muted">Generated with MillSaathi · millsaathi.com</p></main></body></html>`);
});

// ---- Masters ----
const MASTERS: Record<string, { table: string; cols: string[] }> = {
  suppliers: { table: 'suppliers', cols: ['name', 'type', 'place', 'phone'] },
  buyers: { table: 'buyers', cols: ['name', 'type', 'location', 'phone'] },
  items: { table: 'items', cols: ['name', 'category', 'category_code', 'hsn', 'unit', 'base_unit', 'display_unit', 'package_unit', 'package_quantity_base', 'typical_otr_pct'] },
  godowns: { table: 'godowns', cols: ['name', 'capacity_qtl', 'capacity_qty', 'capacity_unit', 'location', 'description', 'notes'] },
};

function validMasterPayload(master: string, body: Record<string, unknown>): string | null {
  if (!String(body.name ?? '').trim()) return 'name is required';
  if (master === 'items' && !['paddy', 'rice', 'byproduct', 'packaging', 'consumable', 'other'].includes(String(body.category ?? 'paddy'))) return 'invalid item category';
  if (master === 'suppliers' && !['farmer', 'trader', 'broker'].includes(String(body.type ?? 'farmer'))) return 'invalid supplier type';
  if (master === 'buyers' && body.type != null && !['Wholesaler', 'Distributor', 'Retailer', 'Exporter', 'Bran buyer', 'Husk buyer'].includes(String(body.type))) return 'invalid buyer type';
  return null;
}

function normalizeMasterPayload(master: string, body: Record<string, unknown>, creating = false): string | null {
  const validationError = validMasterPayload(master, body);
  if (validationError) return validationError;
  if (master === 'items') {
    if (creating || body.category != null) {
      const requestedCategory = String(body.category ?? 'paddy');
      body.category_code = ({ paddy: 'RAW_MATERIAL', rice: 'FINISHED_GOOD', byproduct: 'BYPRODUCT', packaging: 'PACKAGING', consumable: 'CONSUMABLE', other: 'OTHER' } as Record<string, string>)[requestedCategory] || 'OTHER';
      // The original category column has a legacy CHECK constraint. Keep it valid for old readers;
      // category_code is the canonical classification for the expanded domain.
      if (!['paddy', 'rice', 'byproduct'].includes(requestedCategory)) body.category = 'byproduct';
    }
    if (creating || body.base_unit != null) body.base_unit = 'KG';
    if (creating || body.display_unit != null) body.display_unit = String(body.display_unit ?? 'QUINTAL').toUpperCase();
    if (body.display_unit != null && !DISPLAY_UNITS.includes(String(body.display_unit))) return 'invalid display unit';
    if (body.unit != null && !DISPLAY_UNITS.includes(String(body.unit).trim().toUpperCase())) return 'invalid transaction unit';
    if (body.package_unit != null) body.package_unit = String(body.package_unit).toUpperCase();
    if (body.package_unit && !['BAG', 'PIECE'].includes(String(body.package_unit))) return 'package_unit must be BAG or PIECE';
    if (body.package_unit && !(Number(body.package_quantity_base) > 0)) return 'package_quantity_base is required for package units';
  }
  if (master === 'godowns') {
    if (body.capacity_qty == null && body.capacity_qtl != null) body.capacity_qty = Number(body.capacity_qtl);
    if (creating && body.capacity_unit == null) body.capacity_unit = 'QUINTAL';
    if (body.capacity_unit != null && !['KG', 'QUINTAL', 'TONNE', 'BAG', 'PIECE'].includes(String(body.capacity_unit).toUpperCase())) return 'invalid capacity unit';
    if (body.capacity_unit != null) body.capacity_unit = String(body.capacity_unit).toUpperCase();
    if (body.capacity_qty != null && (!Number.isFinite(Number(body.capacity_qty)) || Number(body.capacity_qty) < 0)) return 'capacity must not be negative';
  }
  return null;
}

api.post('/:master{suppliers|buyers|items|godowns}', async (c) => {
  const denied = denyUnless(c, 'CREATE'); if (denied) return denied;
  const { mill } = c.get('session');
  const def = MASTERS[c.req.param('master')];
  const b = await c.req.json<Record<string, unknown>>();
  const validationError = normalizeMasterPayload(c.req.param('master'), b, true);
  if (validationError) return c.json({ error: validationError }, 400);
  const id = uuid();
  const present = def.cols.filter((col) => b[col] != null && b[col] !== '');
  await c.env.DB.prepare(
    `INSERT INTO ${def.table} (id, mill_id${present.map((col) => `, ${col}`).join('')})
     VALUES (?, ?${present.map(() => ', ?').join('')})`,
  )
    .bind(id, mill.id, ...present.map((col) => b[col]))
    .run();
  await audit(c, c.req.param('master'), id, 'CREATE');
  return c.json({ id }, 201);
});

api.patch('/:master{suppliers|buyers|items|godowns}/:id', async (c) => {
  const denied = denyUnless(c, 'EDIT'); if (denied) return denied;
  const { user, mill } = c.get('session');
  const master = c.req.param('master');
  const def = MASTERS[master];
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const validationError = normalizeMasterPayload(master, body);
  if (validationError) return c.json({ error: validationError }, 400);
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(`SELECT id FROM ${def.table} WHERE id = ? AND mill_id = ? AND ${master === 'godowns' ? 'active = 1' : 'deleted_at IS NULL'}`).bind(id, mill.id).first();
  if (!existing) return c.json({ error: 'not found' }, 404);
  const present = def.cols.filter((col) => body[col] != null);
  if (!present.length) return c.json({ error: 'nothing to update' }, 400);
  const values = present.map((col) => body[col] === '' ? null : body[col]);
  await c.env.DB.prepare(`UPDATE ${def.table} SET ${present.map((col) => `${col} = ?`).join(', ')} WHERE id = ? AND mill_id = ?`).bind(...values, id, mill.id).run();
  await audit(c, master, id, 'UPDATE');
  return c.json({ ok: true, id });
});

api.delete('/:master{suppliers|buyers|items|godowns}/:id', async (c) => {
  const denied = denyUnless(c, 'VOID'); if (denied) return denied;
  const { user, mill } = c.get('session');
  const master = c.req.param('master');
  const id = c.req.param('id');
  const table = master === 'suppliers' ? 'suppliers' : master === 'buyers' ? 'buyers' : master === 'items' ? 'items' : master === 'godowns' ? 'godowns' : '';
  if (!table) return c.json({ error: 'unsupported master' }, 400);
  if (table === 'godowns') {
    const res = await c.env.DB.prepare(`UPDATE godowns SET active = 0 WHERE id = ? AND mill_id = ? AND active = 1`).bind(id, mill.id).run();
    if (!res.meta.changes) return c.json({ error: 'not found' }, 404);
  } else {
    const res = await c.env.DB.prepare(`UPDATE ${table} SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), deleted_by = ? WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(user.id, id, mill.id).run();
    if (!res.meta.changes) return c.json({ error: 'not found' }, 404);
  }
  await audit(c, master, id, 'ARCHIVE');
  return c.json({ ok: true });
});

api.get('/team', async (c) => {
  const denied = denyUnless(c, 'MANAGE_MEMBERS'); if (denied) return denied;
  const { mill } = c.get('session');
  const result = await c.env.DB.prepare(`SELECT id, name, email, phone, COALESCE(role_code, role) AS role, active, created_at FROM users WHERE mill_id = ? ORDER BY name`).bind(mill.id).all();
  return c.json({ members: result.results });
});

api.post('/team/invite', async (c) => {
  const denied = denyUnless(c, 'MANAGE_MEMBERS'); if (denied) return denied;
  const { user, mill } = c.get('session');
  if (!['owner', 'admin'].includes(effectiveRole(user))) return c.json({ error: 'not allowed for this role' }, 403);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const email = String(b.email ?? '').trim().toLowerCase();
  const name = String(b.name ?? '').trim();
  const role = String(b.role ?? 'viewer').toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || !name) return c.json({ error: 'name and valid email are required' }, 400);
  if (!['admin', 'manager', 'accountant', 'gate_operator', 'production_operator', 'viewer'].includes(role)) return c.json({ error: 'invalid role' }, 400);
  const legacyRole = role === 'admin' || role === 'manager' ? 'manager' : role === 'accountant' ? 'accountant' : 'operator';
  const existing = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
  if (existing) return c.json({ error: 'an account with this email already exists' }, 409);
  const token = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');
  const temporary = await hashPassword(crypto.randomUUID());
  const id = uuid();
  await c.env.DB.prepare(`INSERT INTO users (id, mill_id, name, email, role, role_code, pass_hash, pass_salt, active, invited_by, invite_token_hash, invite_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, datetime('now', '+7 days'))`)
    .bind(id, mill.id, name, email, legacyRole, role, temporary.hash, temporary.salt, user.id, await hashToken(token)).run();
  await audit(c, 'user', id, 'INVITE');
  return c.json({ id, invite_token: token, invite_url: `/app?invite=${encodeURIComponent(token)}` }, 201);
});

api.post('/team/account', async (c) => {
  const denied = denyUnless(c, 'MANAGE_MEMBERS'); if (denied) return denied;
  const { user, mill } = c.get('session');
  if (!['owner', 'admin'].includes(effectiveRole(user))) return c.json({ error: 'not allowed for this role' }, 403);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const email = String(b.email ?? '').trim().toLowerCase();
  const name = String(b.name ?? '').trim();
  const password = String(b.password ?? '');
  const role = String(b.role ?? 'viewer').toLowerCase();
  const allowedRoles = ['admin', 'manager', 'accountant', 'gate_operator', 'production_operator', 'operator', 'viewer'];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) return c.json({ error: 'name and valid email are required' }, 400);
  if (password.length < 8) return c.json({ error: 'password must be at least 8 characters' }, 400);
  if (!allowedRoles.includes(role)) return c.json({ error: 'invalid role' }, 400);
  if (await c.env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first()) return c.json({ error: 'an account with this email already exists' }, 409);
  const legacyRole = role === 'admin' ? 'manager' : role === 'manager' ? 'manager' : ['accountant'].includes(role) ? 'accountant' : 'operator';
  const credentials = await hashPassword(password);
  const id = uuid();
  await c.env.DB.prepare(`INSERT INTO users (id, mill_id, name, email, role, role_code, pass_hash, pass_salt, active, invited_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
    .bind(id, mill.id, name, email, legacyRole, role, credentials.hash, credentials.salt, user.id).run();
  await audit(c, 'user', id, 'CREATE', 'Owner-created account');
  return c.json({ id }, 201);
});

api.patch('/team/:id', async (c) => {
  const { user, mill } = c.get('session');
  const denied = denyUnless(c, 'MANAGE_MEMBERS'); if (denied) return denied;
  const id = c.req.param('id');
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  if (id === user.id && b.active === 0) return c.json({ error: 'you cannot deactivate your own account' }, 400);
  const target = await c.env.DB.prepare(`SELECT role, role_code FROM users WHERE id = ? AND mill_id = ?`).bind(id, mill.id).first<{ role: string; role_code: string | null }>();
  if (!target) return c.json({ error: 'member not found' }, 404);
  if (typeof b.role === 'string' && effectiveRole(target) === 'owner') return c.json({ error: 'the owner role cannot be changed' }, 400);
  if (id === user.id && typeof b.role === 'string') return c.json({ error: 'you cannot change your own role' }, 400);
  if (b.active === 0) {
    if (effectiveRole(target) === 'owner') {
      const owners = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM users WHERE mill_id = ? AND active = 1 AND role = 'owner'`).bind(mill.id).first<{ count: number }>();
      if (!owners || owners.count <= 1) return c.json({ error: 'the final owner cannot be deactivated' }, 400);
    }
  }
  const sets: string[] = []; const values: unknown[] = [];
  if (b.active === 0 || b.active === 1) { sets.push('active = ?'); values.push(b.active); }
  if (typeof b.role === 'string' && ['admin', 'manager', 'accountant', 'gate_operator', 'production_operator', 'operator', 'viewer'].includes(b.role)) {
    sets.push('role_code = ?, role = ?'); values.push(b.role, b.role === 'admin' || b.role === 'manager' ? 'manager' : b.role === 'accountant' ? 'accountant' : 'operator');
  }
  if (!sets.length) return c.json({ error: 'nothing to update' }, 400);
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ? AND mill_id = ?`).bind(...values, id, mill.id).run();
  await audit(c, 'user', id, 'UPDATE');
  return c.json({ ok: true });
});

api.post('/process-types', async (c) => {
  const denied = denyUnless(c, 'MANAGE_ORGANISATION'); if (denied) return denied;
  const { user, mill } = c.get('session');
  if (!['owner', 'admin'].includes(effectiveRole(user))) return c.json({ error: 'not allowed for this role' }, 403);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const name = String(b.name ?? '').trim();
  if (!name) return c.json({ error: 'name is required' }, 400);
  const id = uuid();
  const defaultUnit = String(b.default_unit ?? '').trim().toUpperCase() || null;
  if (defaultUnit && !DISPLAY_UNITS.includes(defaultUnit)) return c.json({ error: 'unsupported default unit' }, 400);
  const defaultGodown = String(b.default_destination_godown_id ?? '') || null;
  if (defaultGodown && !await c.env.DB.prepare(`SELECT id FROM godowns WHERE id = ? AND mill_id = ? AND active = 1`).bind(defaultGodown, mill.id).first()) return c.json({ error: 'default godown not found' }, 400);
  await c.env.DB.prepare(`INSERT INTO process_types (id, mill_id, name, description, default_unit, default_destination_godown_id) VALUES (?, ?, ?, ?, ?, ?)`).bind(id, mill.id, name, String(b.description ?? '').trim() || null, defaultUnit, defaultGodown).run();
  await audit(c, 'process_type', id, 'CREATE');
  return c.json({ id }, 201);
});

api.get('/process-types', async (c) => {
  const { mill } = c.get('session');
  const includeArchived = c.req.query('include_archived') === '1';
  const result = await c.env.DB.prepare(`SELECT * FROM process_types WHERE mill_id = ?${includeArchived ? '' : ' AND deleted_at IS NULL'} ORDER BY name`).bind(mill.id).all();
  const types = result.results as Record<string, unknown>[];
  const ids = types.map((type) => String(type.id));
  const lineResult = ids.length
    ? await c.env.DB.prepare(`SELECT * FROM process_type_lines WHERE mill_id = ? AND process_type_id IN (${ids.map(() => '?').join(',')}) AND active = 1 ORDER BY sort_order, created_at`).bind(mill.id, ...ids).all<Record<string, unknown>>()
    : { results: [] as Record<string, unknown>[] };
  const linesByType = new Map<string, Record<string, unknown>[]>();
  for (const line of lineResult.results) linesByType.set(String(line.process_type_id), [...(linesByType.get(String(line.process_type_id)) || []), line]);
  return c.json({ process_types: types.map((type) => ({ ...type, template_lines: linesByType.get(String(type.id)) || [] })) });
});

api.put('/process-types/:id/template', async (c) => {
  const denied = denyUnless(c, 'MANAGE_ORGANISATION'); if (denied) return denied;
  const { user, mill } = c.get('session');
  if (!['owner', 'admin'].includes(effectiveRole(user))) return c.json({ error: 'not allowed for this role' }, 403);
  const processTypeId = c.req.param('id');
  const processType = await c.env.DB.prepare(`SELECT id FROM process_types WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(processTypeId, mill.id).first();
  if (!processType) return c.json({ error: 'process type not found' }, 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const lines = Array.isArray(b.lines) ? b.lines as Record<string, unknown>[] : [];
  const defaultUnit = String(b.default_unit ?? '').trim().toUpperCase() || null;
  if (defaultUnit && !DISPLAY_UNITS.includes(defaultUnit)) return c.json({ error: 'unsupported default unit' }, 400);
  const defaultGodown = String(b.default_destination_godown_id ?? '') || null;
  if (defaultGodown && !await c.env.DB.prepare(`SELECT id FROM godowns WHERE id = ? AND mill_id = ? AND active = 1`).bind(defaultGodown, mill.id).first()) return c.json({ error: 'default godown not found' }, 400);
  const allowedTypes = new Set(['INPUT', 'OUTPUT', 'LOSS']);
  const allowedSemantics = new Set(['input', 'main', 'byproduct', 'waste']);
  const itemIds = lines.map((line) => String(line.item_id ?? '')).filter(Boolean);
  if (lines.some((line) => !allowedTypes.has(String(line.line_type)) || !allowedSemantics.has(String(line.semantic_type)) || !String(line.item_id ?? '') || (line.default_unit && !DISPLAY_UNITS.includes(String(line.default_unit).toUpperCase())))) return c.json({ error: 'invalid process template line' }, 400);
  if (itemIds.length) {
    const uniqueItemIds = [...new Set(itemIds)];
    const validItems = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM items WHERE mill_id = ? AND deleted_at IS NULL AND id IN (${uniqueItemIds.map(() => '?').join(',')})`).bind(mill.id, ...uniqueItemIds).first<{ count: number }>();
    if (!validItems || validItems.count !== uniqueItemIds.length) return c.json({ error: 'one or more template items were not found' }, 400);
  }
  const godownIds = [defaultGodown, ...lines.map((line) => String(line.default_godown_id ?? ''))].filter(Boolean);
  if (godownIds.length) {
    const validGodowns = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM godowns WHERE mill_id = ? AND active = 1 AND id IN (${godownIds.map(() => '?').join(',')})`).bind(mill.id, ...godownIds).first<{ count: number }>();
    if (!validGodowns || validGodowns.count !== new Set(godownIds).size) return c.json({ error: 'one or more template godowns were not found' }, 400);
  }
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(`UPDATE process_types SET default_unit = ?, default_destination_godown_id = ? WHERE id = ? AND mill_id = ?`).bind(defaultUnit, defaultGodown, processTypeId, mill.id),
    c.env.DB.prepare(`UPDATE process_type_lines SET active = 0 WHERE process_type_id = ? AND mill_id = ? AND active = 1`).bind(processTypeId, mill.id),
  ];
  lines.forEach((line, index) => {
    statements.push(c.env.DB.prepare(`INSERT INTO process_type_lines (id, mill_id, process_type_id, line_type, semantic_type, item_id, default_unit, default_godown_id, required, auto_calculate, expected_yield_min_pct, expected_yield_max_pct, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      uuid(), mill.id, processTypeId, String(line.line_type), String(line.semantic_type), String(line.item_id), String(line.default_unit ?? '').trim().toUpperCase() || defaultUnit, String(line.default_godown_id ?? '') || null, line.required === false || String(line.required) === '0' ? 0 : 1, line.auto_calculate === true || String(line.auto_calculate) === '1' ? 1 : 0, line.expected_yield_min_pct == null || line.expected_yield_min_pct === '' ? null : Number(line.expected_yield_min_pct), line.expected_yield_max_pct == null || line.expected_yield_max_pct === '' ? null : Number(line.expected_yield_max_pct), Number.isFinite(Number(line.sort_order)) ? Number(line.sort_order) : index,
    ));
  });
  await c.env.DB.batch(statements);
  await audit(c, 'process_type', processTypeId, 'UPDATE', 'Updated process template');
  return c.json({ ok: true });
});

api.get('/process-workspace', async (c) => {
  const { mill } = c.get('session');
  const processTypeId = String(c.req.query('process_type_id') ?? '');
  const processType = await c.env.DB.prepare(`SELECT * FROM process_types WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(processTypeId, mill.id).first<Record<string, unknown>>();
  if (!processType) return c.json({ error: 'process type not found' }, 404);
  const [lines, lots, godowns, items] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT ptl.*, i.name AS item_name, i.base_unit, i.display_unit, i.package_unit, i.package_quantity_base, gd.name AS default_godown_name FROM process_type_lines ptl LEFT JOIN items i ON i.id = ptl.item_id LEFT JOIN godowns gd ON gd.id = ptl.default_godown_id WHERE ptl.process_type_id = ? AND ptl.mill_id = ? AND ptl.active = 1 ORDER BY ptl.sort_order, ptl.created_at`).bind(processTypeId, mill.id),
    c.env.DB.prepare(`SELECT l.*, i.name AS item_name, i.base_unit, i.display_unit, gd.name AS godown_name FROM lots l LEFT JOIN items i ON i.id = l.item_id LEFT JOIN godowns gd ON gd.id = l.godown_id WHERE l.mill_id = ? AND l.qty_kg > 0 AND l.item_id IS NOT NULL ORDER BY l.in_date DESC, l.code DESC LIMIT 1000`).bind(mill.id),
    c.env.DB.prepare(`SELECT * FROM godowns WHERE mill_id = ? AND active = 1 ORDER BY name`).bind(mill.id),
    c.env.DB.prepare(`SELECT id, name, base_unit, display_unit, package_unit, package_quantity_base FROM items WHERE mill_id = ? AND deleted_at IS NULL ORDER BY category, name`).bind(mill.id),
  ]);
  return c.json({ process_type: processType, template_lines: lines.results, lots: lots.results, godowns: godowns.results, items: items.results });
});

api.delete('/process-types/:id', async (c) => {
  const denied = denyUnless(c, 'MANAGE_ORGANISATION'); if (denied) return denied;
  const { user, mill } = c.get('session');
  const id = c.req.param('id');
  const result = await c.env.DB.prepare(`UPDATE process_types SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), deleted_by = ? WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(user.id, id, mill.id).run();
  if (!result.meta.changes) return c.json({ error: 'process type not found' }, 404);
  await audit(c, 'process_type', id, 'ARCHIVE');
  return c.json({ ok: true });
});

api.patch('/process-types/:id/restore', async (c) => {
  const denied = denyUnless(c, 'MANAGE_ORGANISATION'); if (denied) return denied;
  const { user, mill } = c.get('session');
  const id = c.req.param('id');
  const result = await c.env.DB.prepare(`UPDATE process_types SET deleted_at = NULL, deleted_by = NULL WHERE id = ? AND mill_id = ? AND deleted_at IS NOT NULL`).bind(id, mill.id).run();
  if (!result.meta.changes) return c.json({ error: 'archived process type not found' }, 404);
  await audit(c, 'process_type', id, 'RESTORE');
  return c.json({ ok: true });
});

api.get('/process-runs', async (c) => {
  const { mill } = c.get('session');
  const runs = await c.env.DB.prepare(`SELECT r.*, pt.name AS process_type_name, u.name AS creator_name FROM process_runs r LEFT JOIN process_types pt ON pt.id = r.process_type_id LEFT JOIN users u ON u.id = r.created_by WHERE r.mill_id = ? ORDER BY r.run_date DESC, r.created_at DESC LIMIT 1000`).bind(mill.id).all<Record<string, unknown>>();
  const runIds = runs.results.map((run) => String(run.id));
  const lines = runIds.length
    ? await c.env.DB.prepare(`SELECT l.*, i.name AS item_name FROM process_run_lines l LEFT JOIN items i ON i.id = l.item_id WHERE l.mill_id = ? AND l.run_id IN (${runIds.map(() => '?').join(',')}) ORDER BY l.created_at`).bind(mill.id, ...runIds).all<Record<string, unknown>>()
    : { results: [] as Record<string, unknown>[] };
  const byRun = new Map<string, Record<string, unknown>[]>();
  for (const line of lines.results) { const key = String(line.run_id); byRun.set(key, [...(byRun.get(key) || []), line]); }
  return c.json({ runs: runs.results.map((run) => ({ ...run, lines: byRun.get(String(run.id)) || [] })) });
});

api.get('/stock-summary', async (c) => {
  const { mill } = c.get('session');
  const result = await c.env.DB.prepare(`SELECT i.id AS item_id, i.name AS item_name, i.base_unit, COALESCE(SUM(CASE WHEN m.direction = 'IN' THEN m.quantity_base WHEN m.direction = 'OUT' THEN -m.quantity_base ELSE m.quantity_base END), 0) AS quantity_base FROM items i LEFT JOIN stock_movements m ON m.item_id = i.id AND m.mill_id = i.mill_id AND m.status = 'POSTED' WHERE i.mill_id = ? AND i.deleted_at IS NULL GROUP BY i.id ORDER BY i.name`).bind(mill.id).all();
  return c.json({ stock: result.results });
});

api.post('/stock-movements', async (c) => {
  const denied = denyUnless(c, 'CREATE'); if (denied) return denied;
  const { user, mill } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const direction = ['IN', 'OUT', 'ADJUSTMENT'].includes(String(b.direction)) ? String(b.direction) : '';
  if (!direction) return c.json({ error: 'direction is required' }, 400);
  const item = await c.env.DB.prepare(`SELECT id FROM items WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(b.item_id, mill.id).first();
  if (!item) return c.json({ error: 'item not found' }, 400);
  if (b.godown_id && !await c.env.DB.prepare(`SELECT id FROM godowns WHERE id = ? AND mill_id = ? AND active = 1`).bind(b.godown_id, mill.id).first()) return c.json({ error: 'godown not found' }, 400);
  const q = await normalizeItemQuantity(c.env.DB, mill.id, b.item_id, b.quantity, b.unit);
  if (!q || q.base <= 0) return c.json({ error: 'positive quantity and a supported unit are required' }, 400);
  if (direction === 'OUT') {
    const available = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN quantity_base WHEN direction = 'OUT' THEN -quantity_base ELSE quantity_base END), 0) AS quantity
       FROM stock_movements WHERE mill_id = ? AND item_id = ? AND status = 'POSTED'${b.godown_id ? ' AND godown_id = ?' : ''}`,
    ).bind(...(b.godown_id ? [mill.id, b.item_id, b.godown_id] : [mill.id, b.item_id])).first<{ quantity: number }>();
    if ((available?.quantity || 0) < q.base) return c.json({ error: 'insufficient posted stock for this outbound movement' }, 400);
  }
  const id = uuid();
  await c.env.DB.prepare(`INSERT INTO stock_movements (id, mill_id, direction, item_id, godown_id, quantity, unit, quantity_base, base_unit, source_type, movement_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL_ADJUSTMENT', ?, ?)`).bind(id, mill.id, direction, b.item_id, String(b.godown_id ?? '') || null, q.quantity, q.unit, q.base, q.baseUnit, String(b.movement_date ?? istToday()), user.id).run();
  await audit(c, 'stock_movement', id, 'CREATE', String(b.reason ?? '') || undefined);
  return c.json({ id }, 201);
});

api.post('/stock-movements/:id/void', async (c) => {
  const denied = denyUnless(c, 'VOID'); if (denied) return denied;
  const { user, mill } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const result = await c.env.DB.prepare(`UPDATE stock_movements SET status = 'VOID', voided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), voided_by = ? WHERE id = ? AND mill_id = ? AND status = 'POSTED'`).bind(user.id, c.req.param('id'), mill.id).run();
  if (!result.meta.changes) return c.json({ error: 'posted movement not found' }, 404);
  await audit(c, 'stock_movement', c.req.param('id'), 'VOID', String(b.reason ?? '') || undefined);
  return c.json({ ok: true });
});

api.post('/process-runs', async (c) => {
  const denied = denyUnless(c, 'CREATE'); if (denied) return denied;
  const { user, mill } = c.get('session');
  if (!['owner', 'admin', 'manager', 'production_operator', 'operator'].includes(effectiveRole(user))) return c.json({ error: 'not allowed for this role' }, 403);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const processTypeId = String(b.process_type_id ?? '');
  const lines = Array.isArray(b.lines) ? b.lines as Record<string, unknown>[] : [];
  if (!processTypeId || !lines.length) return c.json({ error: 'process_type_id and lines are required' }, 400);
  const processType = await c.env.DB.prepare(`SELECT id FROM process_types WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(processTypeId, mill.id).first();
  if (!processType) return c.json({ error: 'process type not found' }, 400);
  const processTypeConfig = await c.env.DB.prepare(`SELECT default_unit, default_destination_godown_id FROM process_types WHERE id = ? AND mill_id = ?`).bind(processTypeId, mill.id).first<{ default_unit: string | null; default_destination_godown_id: string | null }>();
  const templateLines = await c.env.DB.prepare(`SELECT * FROM process_type_lines WHERE process_type_id = ? AND mill_id = ? AND active = 1 ORDER BY sort_order, created_at`).bind(processTypeId, mill.id).all<Record<string, unknown>>();
  const templateById = new Map(templateLines.results.map((line) => [String(line.id), line]));
  const inferredLines = lines.map((rawLine) => {
    const line = { ...rawLine };
    const template = rawLine.template_line_id ? templateById.get(String(rawLine.template_line_id)) : undefined;
    if (template) {
      if (!line.item_id) line.item_id = template.item_id;
      if (!line.unit) line.unit = template.default_unit || processTypeConfig?.default_unit || undefined;
      if (!line.godown_id && template.default_godown_id) line.godown_id = template.default_godown_id;
      if (!line.semantic_type) line.semantic_type = template.semantic_type;
    }
    const lotId = String(line.lot_id ?? '');
    if (!line.item_id && lotId) line.item_id = '__LOT__';
    return line;
  });
  for (const line of inferredLines) {
    if (line.item_id === '__LOT__' && line.lot_id) {
      const lotItem = await c.env.DB.prepare(`SELECT item_id FROM lots WHERE id = ? AND mill_id = ?`).bind(line.lot_id, mill.id).first<{ item_id: string | null }>();
      line.item_id = lotItem?.item_id || '';
    }
  }
  lines.splice(0, lines.length, ...inferredLines);
  const defaultDestinationGodown = String(b.destination_godown_id ?? '') || processTypeConfig?.default_destination_godown_id || '';
  if (defaultDestinationGodown && !b.destination_godown_id) b.destination_godown_id = defaultDestinationGodown;
  const operatorId = String(b.operator_id ?? user.id);
  if (!await c.env.DB.prepare(`SELECT id FROM users WHERE id = ? AND mill_id = ? AND active = 1`).bind(operatorId, mill.id).first()) return c.json({ error: 'operator not found' }, 400);
  const sourceLotId = String(b.source_lot_id ?? '');
  const inputLines = lines.filter((entry) => entry.line_type === 'INPUT');
  if (sourceLotId && inputLines.length !== 1) return c.json({ error: 'source_lot_id requires exactly one input line' }, 400);
  if (sourceLotId && !inputLines[0].lot_id) inputLines[0].lot_id = sourceLotId;
  const linkedSourceLotId = sourceLotId || (inputLines.length === 1 ? String(inputLines[0].lot_id ?? '') : '');
  if (linkedSourceLotId && !await c.env.DB.prepare(`SELECT id FROM lots WHERE id = ? AND mill_id = ?`).bind(linkedSourceLotId, mill.id).first()) return c.json({ error: 'source lot not found' }, 400);
  const itemIds = lines.map((line) => String(line.item_id ?? '')).filter(Boolean);
  if (!itemIds.length) return c.json({ error: 'each process line needs an item or a resolvable source lot' }, 400);
  const placeholders = itemIds.map(() => '?').join(',');
  const uniqueItemIds = [...new Set(itemIds)];
  const validItems = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM items WHERE mill_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`).bind(mill.id, ...itemIds).first<{ count: number }>();
  if (!validItems || validItems.count !== uniqueItemIds.length) return c.json({ error: 'one or more items were not found' }, 400);
  const godownIds = [String(b.destination_godown_id ?? ''), ...lines.map((line) => String(line.godown_id ?? ''))].filter(Boolean);
  if (godownIds.length) {
    const godownPlaceholders = godownIds.map(() => '?').join(',');
    const godownCount = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM godowns WHERE mill_id = ? AND active = 1 AND id IN (${godownPlaceholders})`).bind(mill.id, ...godownIds).first<{ count: number }>();
    if (!godownCount || godownCount.count !== new Set(godownIds).size) return c.json({ error: 'one or more process godowns were not found' }, 400);
  }
  const normalizedLines = await Promise.all(lines.map(async (line) => ({ line, q: await normalizeItemQuantity(c.env.DB, mill.id, line.item_id, line.quantity, line.unit) })));
  if (!normalizedLines.every(({ line, q }) => ['INPUT', 'OUTPUT', 'LOSS'].includes(String(line.line_type)) && !!String(line.item_id ?? '') && !!q && q.base > 0)) return c.json({ error: 'each process line needs a valid positive item quantity and unit' }, 400);
  const inputLotGodowns = new Map<string, string | null>();
  for (const line of inputLines) {
    const q = normalizedLines.find((entry) => entry.line === line)!.q!;
    if (line.lot_id && !Number.isInteger(q.base)) return c.json({ error: 'source lot quantities must normalize to whole kilograms' }, 400);
    const available = await c.env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN quantity_base WHEN direction = 'OUT' THEN -quantity_base ELSE quantity_base END),0) AS quantity FROM stock_movements WHERE mill_id = ? AND item_id = ? AND status = 'POSTED'`).bind(mill.id, line.item_id).first<{ quantity: number }>();
    if ((available?.quantity || 0) < q.base) return c.json({ error: `insufficient posted stock for item ${line.item_id}` }, 400);
    if (line.lot_id) {
      const lot = await c.env.DB.prepare(`SELECT id, item_id, qty_kg, godown_id FROM lots WHERE id = ? AND mill_id = ?`).bind(line.lot_id, mill.id).first<{ id: string; item_id: string | null; qty_kg: number; godown_id: string | null }>();
      if (!lot || lot.item_id !== line.item_id || lot.qty_kg < q.base) return c.json({ error: `insufficient quantity in source lot ${line.lot_id}` }, 400);
      inputLotGodowns.set(String(line.lot_id), lot.godown_id);
    }
  }
  const runId = uuid();
  const preparedLines: { line: Record<string, unknown>; q: { quantity: number; unit: string; base: number; baseUnit: string }; lotId: string | null; godownId: string | null; lotCode?: string }[] = [];
  for (const { line, q: normalized } of normalizedLines) {
    const q = normalized!;
    let lotId = String(line.lot_id ?? '') || null;
    const godownId = line.line_type === 'INPUT' && lotId ? (inputLotGodowns.get(lotId) ?? null) : String(line.godown_id ?? b.destination_godown_id ?? '') || null;
    if (line.line_type === 'OUTPUT' && godownId) {
      if (!Number.isInteger(q.base)) return c.json({ error: 'output quantities assigned to lots must normalize to whole kilograms' }, 400);
      lotId = uuid();
      preparedLines.push({ line, q, lotId, godownId, lotCode: await nextCode(c.env.DB, mill.id, 'lot', 'LOT') });
    } else preparedLines.push({ line, q, lotId, godownId });
  }
  const statements: D1PreparedStatement[] = [c.env.DB.prepare(`INSERT INTO process_runs (id, mill_id, process_type_id, run_date, shift, operator_id, source_lot_id, destination_godown_id, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(runId, mill.id, processTypeId, String(b.run_date ?? istToday()), String(b.shift ?? '') || null, operatorId, linkedSourceLotId || null, String(b.destination_godown_id ?? '') || null, String(b.notes ?? '') || null, user.id)];
  for (const prepared of preparedLines) {
    const line = prepared.line, q = prepared.q;
    if (prepared.lotCode) statements.push(c.env.DB.prepare(`INSERT INTO lots (id, mill_id, code, godown_id, item_id, qty_kg, in_date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(prepared.lotId, mill.id, prepared.lotCode, prepared.godownId, line.item_id, Math.round(q.base), String(b.run_date ?? istToday()), `Created by process run ${runId}`));
    if (line.line_type === 'INPUT' && prepared.lotId) statements.push(c.env.DB.prepare(`UPDATE lots SET qty_kg = qty_kg - ? WHERE id = ? AND mill_id = ? AND qty_kg >= ?`).bind(Math.round(q.base), prepared.lotId, mill.id, Math.round(q.base)));
    statements.push(c.env.DB.prepare(`INSERT INTO process_run_lines (id, mill_id, run_id, line_type, item_id, lot_id, quantity, unit, quantity_base, base_unit, godown_id, semantic_type, template_line_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(uuid(), mill.id, runId, line.line_type, line.item_id, prepared.lotId, q.quantity, q.unit, q.base, q.baseUnit, prepared.godownId, String(line.semantic_type ?? (line.line_type === 'INPUT' ? 'input' : line.line_type === 'LOSS' ? 'waste' : 'main')), String(line.template_line_id ?? '') || null));
    if (line.line_type !== 'LOSS') {
      statements.push(c.env.DB.prepare(`INSERT INTO stock_movements (id, mill_id, direction, item_id, godown_id, lot_id, quantity, unit, quantity_base, base_unit, source_type, source_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESS_RUN', ?, ?)`).bind(uuid(), mill.id, line.line_type === 'OUTPUT' ? 'IN' : 'OUT', line.item_id, prepared.godownId, prepared.lotId, q.quantity, q.unit, q.base, q.baseUnit, runId, user.id));
    }
  }
  await c.env.DB.batch(statements);
  await audit(c, 'process_run', runId, 'CREATE');
  return c.json({ id: runId }, 201);
});

api.post('/process-runs/:id/void', async (c) => {
  const denied = denyUnless(c, 'VOID'); if (denied) return denied;
  const { user, mill } = c.get('session');
  const id = c.req.param('id');
  const run = await c.env.DB.prepare(`SELECT id, status FROM process_runs WHERE id = ? AND mill_id = ?`).bind(id, mill.id).first<{ id: string; status: string }>();
  if (!run) return c.json({ error: 'process run not found' }, 404);
  if (run.status !== 'POSTED') return c.json({ error: 'process run is already void or not posted' }, 409);
  const lines = await c.env.DB.prepare(`SELECT line_type, lot_id, quantity_base FROM process_run_lines WHERE run_id = ? AND mill_id = ?`).bind(id, mill.id).all<{ line_type: string; lot_id: string | null; quantity_base: number }>();
  const outputLots = lines.results.filter((line) => line.line_type === 'OUTPUT' && line.lot_id).map((line) => String(line.lot_id));
  if (outputLots.length) {
    const placeholders = outputLots.map(() => '?').join(',');
    const laterMovement = await c.env.DB.prepare(`SELECT id FROM stock_movements WHERE mill_id = ? AND lot_id IN (${placeholders}) AND status = 'POSTED' AND NOT (source_type = 'PROCESS_RUN' AND source_id = ?) LIMIT 1`).bind(mill.id, ...outputLots, id).first();
    if (laterMovement) return c.json({ error: 'cannot void this run because an output lot has already been used by another posted movement' }, 409);
  }
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(`UPDATE process_runs SET status = 'VOID' WHERE id = ? AND mill_id = ? AND status = 'POSTED'`).bind(id, mill.id),
    c.env.DB.prepare(`UPDATE stock_movements SET status = 'VOID', voided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), voided_by = ? WHERE mill_id = ? AND source_type = 'PROCESS_RUN' AND source_id = ? AND status = 'POSTED'`).bind(user.id, mill.id, id),
  ];
  for (const line of lines.results) {
    if (!line.lot_id) continue;
    if (line.line_type === 'INPUT') statements.push(c.env.DB.prepare(`UPDATE lots SET qty_kg = qty_kg + ? WHERE id = ? AND mill_id = ?`).bind(Math.round(line.quantity_base), line.lot_id, mill.id));
    if (line.line_type === 'OUTPUT') statements.push(c.env.DB.prepare(`UPDATE lots SET qty_kg = 0 WHERE id = ? AND mill_id = ?`).bind(line.lot_id, mill.id));
  }
  await c.env.DB.batch(statements);
  await audit(c, 'process_run', id, 'VOID', 'Reversed process stock movements and restored source lots');
  return c.json({ ok: true });
});

function normalizePartyKey(value: unknown): string { return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' '); }
function partyKeys(row: Record<string, unknown>): string[] {
  return [row.gstin, row.email, row.phone, row.name].map(normalizePartyKey).filter(Boolean);
}
function validatePartyRow(kind: string, row: Record<string, unknown>): string | null {
  if (!['supplier', 'buyer'].includes(kind)) return 'kind must be supplier or buyer';
  if (!normalizePartyKey(row.name)) return 'name is required';
  if (kind === 'supplier' && row.type != null && !['farmer', 'trader', 'broker'].includes(String(row.type))) return 'invalid supplier type';
  return null;
}

api.post('/parties/import/validate', async (c) => {
  const { mill } = c.get('session');
  if (Number(c.req.header('content-length') || 0) > 2 * 1024 * 1024) return c.json({ error: 'import payload must be 2 MB or smaller' }, 413);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const kind = String(b.kind ?? '');
  const rows = Array.isArray(b.rows) ? b.rows as Record<string, unknown>[] : [];
  if (!rows.length || rows.length > 1000) return c.json({ error: 'upload between 1 and 1,000 rows' }, 400);
  const table = kind === 'supplier' ? 'suppliers' : kind === 'buyer' ? 'buyers' : '';
  if (!table) return c.json({ error: 'invalid party kind' }, 400);
  const existing = await c.env.DB.prepare(`SELECT name, email, phone, gstin FROM ${table} WHERE mill_id = ? AND deleted_at IS NULL`).bind(mill.id).all<Record<string, string | null>>();
  const keys = new Set(existing.results.flatMap((r) => [r.gstin, r.email, r.phone, r.name].filter(Boolean).map(normalizePartyKey)));
  const seen = new Set<string>();
  const checked = rows.map((row, index) => {
    const error = validatePartyRow(kind, row);
    const identities = partyKeys(row);
    const duplicate = identities.some((identity) => keys.has(identity) || seen.has(identity));
    identities.forEach((identity) => seen.add(identity));
    return { row_number: index + 1, row, error, duplicate };
  });
  return c.json({ rows: checked, valid: checked.filter((r) => !r.error && !r.duplicate).length, duplicates: checked.filter((r) => r.duplicate).length, errors: checked.filter((r) => r.error).length });
});

api.get('/parties/import/template.csv', async (c) => {
  const denied = denyUnless(c, 'CREATE'); if (denied) return denied;
  const kind = String(c.req.query('kind') ?? 'supplier');
  if (!['supplier', 'buyer'].includes(kind)) return c.json({ error: 'invalid party kind' }, 400);
  const header = kind === 'supplier'
    ? 'name,type,place,phone,email,gstin,address\r\n'
    : 'name,type,location,phone,email,gstin,address\r\n';
  return new Response(header, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="millsaathi-${kind}-template.csv"` } });
});

api.post('/parties/import/commit', async (c) => {
  const denied = denyUnless(c, 'CREATE'); if (denied) return denied;
  const { user, mill } = c.get('session');
  if (Number(c.req.header('content-length') || 0) > 2 * 1024 * 1024) return c.json({ error: 'import payload must be 2 MB or smaller' }, 413);
  if (!['owner', 'admin', 'manager', 'accountant'].includes(effectiveRole(user))) return c.json({ error: 'not allowed for this role' }, 403);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const kind = String(b.kind ?? '');
  const rows = Array.isArray(b.rows) ? b.rows as Record<string, unknown>[] : [];
  const skipDuplicates = b.skip_duplicates !== false;
  if (!['supplier', 'buyer'].includes(kind) || !rows.length || rows.length > 1000) return c.json({ error: 'invalid import payload' }, 400);
  const table = kind === 'supplier' ? 'suppliers' : 'buyers';
  const existing = await c.env.DB.prepare(`SELECT name, email, phone, gstin FROM ${table} WHERE mill_id = ? AND deleted_at IS NULL`).bind(mill.id).all<Record<string, string | null>>();
  const keys = new Set(existing.results.flatMap((r) => [r.gstin, r.email, r.phone, r.name].filter(Boolean).map(normalizePartyKey)));
  const statements: D1PreparedStatement[] = [];
  let imported = 0, skipped = 0, failed = 0;
  for (const row of rows) {
    const error = validatePartyRow(kind, row);
    const identities = partyKeys(row);
    if (error) { failed++; continue; }
    if (identities.some((identity) => keys.has(identity))) { if (skipDuplicates) skipped++; else failed++; continue; }
    identities.forEach((identity) => keys.add(identity));
    const id = uuid();
    if (kind === 'supplier') statements.push(c.env.DB.prepare(`INSERT INTO suppliers (id, mill_id, name, type, place, phone, email, gstin, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, mill.id, String(row.name).trim(), String(row.type || 'farmer'), String(row.place || '').trim() || null, String(row.phone || '').trim() || null, String(row.email || '').trim() || null, String(row.gstin || '').trim() || null, String(row.address || '').trim() || null));
    else statements.push(c.env.DB.prepare(`INSERT INTO buyers (id, mill_id, name, type, location, phone, email, gstin, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, mill.id, String(row.name).trim(), String(row.type || 'Wholesaler'), String(row.location || '').trim() || null, String(row.phone || '').trim() || null, String(row.email || '').trim() || null, String(row.gstin || '').trim() || null, String(row.address || '').trim() || null));
    imported++;
  }
  if (statements.length) await c.env.DB.batch(statements);
  return c.json({ imported, skipped, failed });
});

api.post('/documents', async (c) => {
  const denied = denyUnless(c, 'CREATE'); if (denied) return denied;
  const { user, mill } = c.get('session');
  if (!['owner', 'admin', 'manager', 'accountant'].includes(effectiveRole(user))) return c.json({ error: 'not allowed for this role' }, 403);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const type = String(b.document_type ?? '');
  const lines = Array.isArray(b.lines) ? b.lines as Record<string, unknown>[] : [];
  if (!['PURCHASE_STATEMENT', 'SALES_INVOICE', 'PAYMENT_RECEIPT', 'WEIGHMENT_SLIP'].includes(type) || !lines.length) return c.json({ error: 'document_type and lines are required' }, 400);
  const partyKind = String(b.party_kind ?? '');
  const partyId = String(b.party_id ?? '');
  if (partyId && !['supplier', 'buyer'].includes(partyKind)) return c.json({ error: 'party_kind must be supplier or buyer' }, 400);
  if (partyId) {
    const partyTable = partyKind === 'supplier' ? 'suppliers' : 'buyers';
    const party = await c.env.DB.prepare(`SELECT id FROM ${partyTable} WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`).bind(partyId, mill.id).first();
    if (!party) return c.json({ error: 'party not found' }, 400);
  }
  for (const [field, table] of [['sauda_id', 'saudas'], ['gate_entry_id', 'gate_entries']] as const) {
    const value = String(b[field] ?? '');
    if (value && !await c.env.DB.prepare(`SELECT id FROM ${table} WHERE id = ? AND mill_id = ?`).bind(value, mill.id).first()) return c.json({ error: `${field} not found` }, 400);
  }
  const lineItemIds = lines.map((line) => String(line.item_id ?? '')).filter(Boolean);
  if (lineItemIds.length) {
    const placeholders = lineItemIds.map(() => '?').join(',');
    const itemCount = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM items WHERE mill_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`).bind(mill.id, ...lineItemIds).first<{ count: number }>();
    if (!itemCount || itemCount.count !== new Set(lineItemIds).size) return c.json({ error: 'one or more document items were not found' }, 400);
  }
  const prefix = type === 'SALES_INVOICE' ? 'INV' : type === 'PURCHASE_STATEMENT' ? 'PUR' : type === 'PAYMENT_RECEIPT' ? 'RCT' : 'WGT';
  const documentId = uuid();
  const issueDate = String(b.issue_date ?? istToday());
  const requestedFinancialYear = String(b.financial_year ?? '').trim();
  const financialYear = /^\d{4}-\d{2}$/.test(requestedFinancialYear) ? requestedFinancialYear : financialYearFor(issueDate);
  const sequence = await nextCode(c.env.DB, mill.id, `document_${prefix}_${financialYear}`, prefix);
  const documentNo = `${prefix}-${financialYear}-${sequence.slice(prefix.length + 1)}`;
  const normalizedLines = lines.map((line) => ({ item_id: String(line.item_id ?? '') || null, description: String(line.description ?? '').trim(), hsn: String(line.hsn ?? '').trim() || null, quantity: line.quantity == null ? null : Number(line.quantity), unit: String(line.unit ?? '').trim() || null, rate: Number(line.rate_paise ?? 0), taxable: Number(line.taxable_paise ?? 0), gstRate: Number(line.gst_rate_pct ?? b.gst_rate_pct ?? 0) })).filter((line) => line.description);
  if (!normalizedLines.length) return c.json({ error: 'at least one line description is required' }, 400);
  if (normalizedLines.some((line) => (line.quantity != null && (!Number.isFinite(line.quantity) || line.quantity < 0)) || !Number.isFinite(line.rate) || line.rate < 0 || !Number.isFinite(line.taxable) || line.taxable < 0)) return c.json({ error: 'document quantities and amounts must be non-negative numbers' }, 400);
  normalizedLines.forEach((line) => { line.rate = Math.round(line.rate); line.taxable = Math.round(line.taxable); });
  const subtotal = normalizedLines.reduce((sum, line) => sum + line.taxable, 0);
  if (normalizedLines.some((line) => !Number.isFinite(line.gstRate) || line.gstRate < 0 || line.gstRate > 100)) return c.json({ error: 'GST rate must be between 0 and 100' }, 400);
  const discount = Number(b.discount_paise ?? 0);
  const nonNegativeMoney = ['cgst_paise', 'sgst_paise', 'igst_paise', 'cess_paise'];
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal || nonNegativeMoney.some((key) => !Number.isFinite(Number(b[key] ?? 0)) || Number(b[key] ?? 0) < 0) || !Number.isFinite(Number(b.rounding_paise ?? 0))) return c.json({ error: 'document amounts are invalid' }, 400);
  const requestedTaxRate = Number(b.gst_rate_pct ?? NaN);
  const calculatedTax = Number.isFinite(requestedTaxRate) ? Math.round(subtotal * requestedTaxRate / 100) : null;
  const intraState = String(b.tax_mode ?? '') === 'INTRA';
  const cgst = calculatedTax == null ? Math.round(Number(b.cgst_paise ?? 0)) : intraState ? Math.floor(calculatedTax / 2) : 0;
  const sgst = calculatedTax == null ? Math.round(Number(b.sgst_paise ?? 0)) : intraState ? calculatedTax - cgst : 0;
  const igst = calculatedTax == null ? Math.round(Number(b.igst_paise ?? 0)) : intraState ? 0 : calculatedTax;
  const tax = cgst + sgst + igst + Math.round(Number(b.cess_paise ?? 0)) + Math.round(Number(b.rounding_paise ?? 0));
  const total = subtotal - discount + tax;
  const statements: D1PreparedStatement[] = [c.env.DB.prepare(`INSERT INTO documents (id, mill_id, document_type, document_no, financial_year, issue_date, party_kind, party_id, sauda_id, gate_entry_id, subtotal_paise, discount_paise, cgst_paise, sgst_paise, igst_paise, cess_paise, rounding_paise, total_paise, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(documentId, mill.id, type, documentNo, financialYear, issueDate, partyKind || null, partyId || null, String(b.sauda_id ?? '') || null, String(b.gate_entry_id ?? '') || null, subtotal, Math.round(discount), cgst, sgst, igst, Math.round(Number(b.cess_paise ?? 0)), Math.round(Number(b.rounding_paise ?? 0)), total, String(b.notes ?? '') || null, user.id)];
  for (const line of normalizedLines) statements.push(c.env.DB.prepare(`INSERT INTO document_lines (id, mill_id, document_id, item_id, description, hsn, quantity, unit, rate_paise, taxable_paise, gst_rate_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(uuid(), mill.id, documentId, line.item_id, line.description, line.hsn, line.quantity, line.unit, line.rate, line.taxable, line.gstRate));
  await c.env.DB.batch(statements);
  await audit(c, 'document', documentId, 'CREATE');
  return c.json({ id: documentId, document_no: documentNo, total_paise: total }, 201);
});

api.post('/documents/upload', async (c) => {
  const denied = denyUnless(c, 'CREATE'); if (denied) return denied;
  const { user, mill } = c.get('session');
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || !file.size) return c.json({ error: 'choose a file to upload' }, 400);
  if (file.size > 1024 * 1024) return c.json({ error: 'uploads are limited to 1 MB in V1' }, 400);
  const documentType = String(form.get('document_type') || 'PAYMENT_RECEIPT');
  if (!['PURCHASE_STATEMENT', 'SALES_INVOICE', 'PAYMENT_RECEIPT', 'WEIGHMENT_SLIP'].includes(documentType)) return c.json({ error: 'invalid document type' }, 400);
  const id = uuid();
  const number = `UPL-${(await nextCode(c.env.DB, mill.id, 'uploaded_document', 'UPL')).slice(4)}`;
  await c.env.DB.prepare(`INSERT INTO documents (id, mill_id, document_type, document_no, issue_date, source, upload_name, upload_mime, upload_data, notes, created_by) VALUES (?, ?, ?, ?, ?, 'UPLOADED', ?, ?, ?, ?, ?)`)
    .bind(id, mill.id, documentType, number, String(form.get('issue_date') || istToday()), file.name, file.type || 'application/octet-stream', await file.arrayBuffer(), String(form.get('notes') || '') || null, user.id).run();
  await audit(c, 'document', id, 'CREATE', 'Uploaded document');
  return c.json({ id, document_no: number }, 201);
});

api.get('/documents', async (c) => {
  const { user, mill } = c.get('session');
  const result = await c.env.DB.prepare(`SELECT d.*, COALESCE(b.name, s.name) AS party_name, COALESCE((SELECT SUM(p.amount_paise) FROM payments p WHERE p.mill_id = d.mill_id AND p.document_id = d.id AND p.status = 'POSTED'), 0) AS paid_paise FROM documents d LEFT JOIN buyers b ON d.party_kind='buyer' AND b.id=d.party_id LEFT JOIN suppliers s ON d.party_kind='supplier' AND s.id=d.party_id WHERE d.mill_id = ? ORDER BY d.issue_date DESC, d.created_at DESC LIMIT 500`).bind(mill.id).all();
  const body = { documents: result.results };
  return c.json(user.role_code === 'manager' || user.role === 'manager' ? stripMoney(body) : body);
});

api.get('/documents/:id/file', async (c) => {
  const { mill } = c.get('session');
  const file = await c.env.DB.prepare(`SELECT upload_name, upload_mime, upload_data FROM documents WHERE id = ? AND mill_id = ? AND source = 'UPLOADED'`).bind(c.req.param('id'), mill.id).first<{ upload_name: string; upload_mime: string; upload_data: ArrayBuffer }>();
  if (!file?.upload_data) return c.json({ error: 'uploaded file not found' }, 404);
  return new Response(file.upload_data, { headers: { 'content-type': file.upload_mime, 'content-disposition': `inline; filename="${file.upload_name.replace(/["\\]/g, '')}"` } });
});

api.get('/documents/export.csv', async (c) => {
  const denied = denyUnless(c, 'EXPORT'); if (denied) return denied;
  const { user, mill } = c.get('session');
  const moneyColumns = user.role_code === 'manager' || user.role === 'manager' ? '' : ', subtotal_paise, total_paise';
  const result = await c.env.DB.prepare(`SELECT document_no, document_type, issue_date, financial_year, party_kind, party_id${moneyColumns}, status, notes FROM documents WHERE mill_id = ? ORDER BY issue_date DESC, created_at DESC`).bind(mill.id).all<Record<string, unknown>>();
  const safe = (value: unknown) => { const s = String(value ?? ''); return /^[=+\-@]/.test(s) ? "'" + s : s; };
  const cell = (value: unknown) => '"' + safe(value).replaceAll('"', '""') + '"';
  const lines = [(['Document No', 'Type', 'Issue Date', 'Financial Year', 'Party Kind', 'Party ID'] as unknown[]).concat(moneyColumns ? ['Subtotal (paise)', 'Total (paise)'] : [], ['Status', 'Notes']), ...result.results.map((row) => ([row.document_no, row.document_type, row.issue_date, row.financial_year, row.party_kind, row.party_id] as unknown[]).concat(moneyColumns ? [row.subtotal_paise, row.total_paise] : [], [row.status, row.notes]))];
  return new Response(lines.map((line) => line.map(cell).join(',')).join('\r\n') + '\r\n', { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="millsaathi-documents.csv"' } });
});

api.get('/documents/export.xls', async (c) => {
  const denied = denyUnless(c, 'EXPORT'); if (denied) return denied;
  const { user, mill } = c.get('session');
  const showMoney = effectiveRole(user) !== 'manager';
  const result = await c.env.DB.prepare(`SELECT document_no, document_type, issue_date, financial_year, party_kind, party_id${showMoney ? ', subtotal_paise, total_paise' : ''}, status, notes FROM documents WHERE mill_id = ? ORDER BY issue_date DESC, created_at DESC`).bind(mill.id).all<Record<string, unknown>>();
  const fields = ['Document No', 'Type', 'Issue Date', 'Financial Year', 'Party Kind', 'Party ID'].concat(showMoney ? ['Subtotal (₹)', 'Total (₹)'] : [], ['Status', 'Notes']);
  const xml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const cell = (value: unknown, numeric = false) => `<Cell><Data ss:Type="${numeric ? 'Number' : 'String'}">${xml(value)}</Data></Cell>`;
  const header = `<Row>${fields.map((field) => cell(field)).join('')}</Row>`;
  const rows = result.results.map((row) => {
    const values: [unknown, boolean][] = [[row.document_no, false], [row.document_type, false], [row.issue_date, false], [row.financial_year, false], [row.party_kind, false], [row.party_id, false]];
    if (showMoney) values.push([Number(row.subtotal_paise || 0) / 100, true], [Number(row.total_paise || 0) / 100, true]);
    values.push([row.status, false], [row.notes, false]);
    return `<Row>${values.map(([value, numeric]) => cell(value, numeric)).join('')}</Row>`;
  }).join('');
  const workbook = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Documents"><Table>${header}${rows}</Table></Worksheet></Workbook>`;
  return new Response(workbook, { headers: { 'content-type': 'application/vnd.ms-excel; charset=utf-8', 'content-disposition': 'attachment; filename="millsaathi-documents.xls"' } });
});

api.post('/documents/:id/void', async (c) => {
  const denied = denyUnless(c, 'VOID'); if (denied) return denied;
  const { user, mill } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const reason = String(b.reason ?? '').trim();
  if (reason.length < 3) return c.json({ error: 'a void reason is required' }, 400);
  const id = c.req.param('id');
  const result = await c.env.DB.prepare(`UPDATE documents SET status = 'VOID', voided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), voided_by = ? WHERE id = ? AND mill_id = ? AND status = 'POSTED'`).bind(user.id, id, mill.id).run();
  if (!result.meta.changes) return c.json({ error: 'posted document not found' }, 404);
  await audit(c, 'document', id, 'VOID', reason);
  return c.json({ ok: true });
});

api.get('/documents/:id/print', async (c) => {
  const denied = denyUnless(c, 'EXPORT'); if (denied) return denied;
  const { user, mill } = c.get('session');
  const showMoney = effectiveRole(user) !== 'manager';
  const document = await c.env.DB.prepare(`SELECT * FROM documents WHERE id = ? AND mill_id = ?`).bind(c.req.param('id'), mill.id).first<Record<string, unknown>>();
  if (!document) return c.html('<h1>Document not found</h1>', 404);
  let party: Record<string, unknown> | null = null;
  if (document.party_id && (document.party_kind === 'supplier' || document.party_kind === 'buyer')) {
    const table = document.party_kind === 'supplier' ? 'suppliers' : 'buyers';
    party = await c.env.DB.prepare(`SELECT name, address, phone, email, gstin FROM ${table} WHERE id = ? AND mill_id = ?`).bind(document.party_id, mill.id).first<Record<string, unknown>>();
  }
  const lines = await c.env.DB.prepare(`SELECT dl.*, i.name AS item_name FROM document_lines dl LEFT JOIN items i ON i.id = dl.item_id WHERE dl.document_id = ? AND dl.mill_id = ? ORDER BY dl.created_at`).bind(c.req.param('id'), mill.id).all<Record<string, unknown>>();
  const escHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[ch]);
  const rupees = (value: unknown) => (Number(value || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lineHtml = lines.results.map((line) => `<tr><td>${escHtml(line.item_name || line.description)}${line.item_name && line.description !== line.item_name ? `<br><small>${escHtml(line.description)}</small>` : ''}</td><td>${escHtml(line.hsn)}</td><td>${escHtml(line.quantity)} ${escHtml(line.unit)}</td>${showMoney ? `<td>₹${escHtml(rupees(line.rate_paise))}</td><td>₹${escHtml(rupees(line.taxable_paise))}</td>` : ''}</tr>`).join('');
  return c.html(`<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(document.document_no)} · ${escHtml(mill.name)}</title>${printStyles}</head><body><main class="sheet"><div class="actions"><button onclick="print()">Print / Save PDF</button></div><div class="brand"><div><h1>${escHtml(mill.name)}</h1><div class="muted">${escHtml(mill.address)}${mill.place_of_supply ? ` · ${escHtml(mill.place_of_supply)}` : ''}${mill.phone ? ` · ${escHtml(mill.phone)}` : ''}</div><div class="muted">${mill.gstin ? `GSTIN: ${escHtml(mill.gstin)} · ` : ''}${escHtml(mill.email || '')}</div></div><div class="label">MillSaathi</div></div><h2 class="title">${escHtml(document.document_type)}</h2><div class="meta"><div><div class="label">Document no.</div><strong>${escHtml(document.document_no)}</strong></div><div><div class="label">Issue date</div><strong>${escHtml(document.issue_date)}</strong></div><div><div class="label">Party</div><strong>${escHtml(party?.name || '—')}</strong></div></div><table><thead><tr><th>Description</th><th>HSN</th><th>Quantity</th>${showMoney ? '<th>Rate (₹)</th><th>Taxable (₹)</th>' : ''}</tr></thead><tbody>${lineHtml}</tbody></table>${showMoney ? `<div class="total"><span>Total</span><span>₹${escHtml(rupees(document.total_paise))}</span></div>` : ''}${document.notes ? `<div class="notes"><strong>Notes</strong><br>${escHtml(document.notes)}</div>` : ''}<p class="muted">Generated with MillSaathi · millsaathi.com</p></main></body></html>`);
});

api.post('/feedback', async (c) => {
  const { user, mill } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const message = String(b.message ?? '').trim();
  if (message.length < 5) return c.json({ error: 'Please write a little more detail.' }, 400);
  const kind = ['help', 'bug', 'feature'].includes(String(b.kind)) ? String(b.kind) : 'help';
  const table = await c.env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'feedback_tickets'`).first();
  if (!table) return c.json({ error: 'Help box needs the latest database migration.' }, 503);
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO feedback_tickets (id, mill_id, user_id, kind, page, message, contact)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, mill.id, user.id, kind, (b.page as string) || null, message.slice(0, 2000), (b.contact as string) || user.email)
    .run();
  return c.json({ id }, 201);
});

api.get('/feedback/tickets', async (c) => {
  const { user } = c.get('session');
  if (!isSupportAdmin(user)) return c.json({ error: 'not found' }, 404);
  const table = await c.env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'feedback_tickets'`).first();
  if (!table) return c.json({ error: 'Bug reports need the latest database migration.' }, 503);
  const res = await c.env.DB.prepare(
    `SELECT f.id, f.kind, f.page, f.message, f.contact, f.status, f.created_at,
            m.name AS mill_name, u.name AS user_name, u.email AS user_email
     FROM feedback_tickets f
     LEFT JOIN mills m ON m.id = f.mill_id
     LEFT JOIN users u ON u.id = f.user_id
     ORDER BY f.created_at DESC
LIMIT 1000`,
  ).all();
  return c.json({ tickets: res.results });
});

api.patch('/feedback/tickets/:id/status', async (c) => {
  const { user } = c.get('session');
  if (!isSupportAdmin(user)) return c.json({ error: 'not found' }, 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const status = String(b.status ?? '');
  if (!['open', 'reviewed', 'closed'].includes(status)) return c.json({ error: 'invalid status' }, 400);
  const res = await c.env.DB.prepare(`UPDATE feedback_tickets SET status = ? WHERE id = ?`)
    .bind(status, c.req.param('id'))
    .run();
  if (!res.meta.changes) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
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
    db.prepare(`SELECT COALESCE(SUM(amount_paise),0) AS paid FROM payments WHERE mill_id = ?1 AND pay_date = ?2 AND direction='paid' AND status = 'POSTED'`).bind(mill.id, today),
  ]);
  const byDir: Record<string, { trucks: number; net_kg: number }> = {};
  for (const r of gateRes.results as { direction: string; trucks: number; net_kg: number }[]) byDir[r.direction] = r;
  const mb = massBalance((prodRes.results[0] as never) ?? null);
  const paid = (payRes.results[0] as { paid: number }).paid;
  const qtl = (kg: number) => (kg / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const lakh = (p: number) => `₹${(p / 10_000_000).toFixed(1)} L`;

  const lines = [
    `*${mill.name}* — Night Digest, ${today}`,
    `Incoming: ${byDir.in?.trucks ?? 0} trucks · ${qtl(byDir.in?.net_kg ?? 0)} qtl`,
    `Dispatched: ${qtl(byDir.out?.net_kg ?? 0)} qtl`,
    ...(effectiveRole(user) !== 'manager' ? [`Cash paid: ${lakh(paid)}`] : []),
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
  return c.json(effectiveRole(user) === 'manager' ? (stripMoney(body) as typeof body) : body);
});
