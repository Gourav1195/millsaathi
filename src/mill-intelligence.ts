import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from './index';
import { denyUnlessCapability } from './permissions';
import {
  buildChainOtrEvents,
  buildOtrSummaries,
  moistureRangeStatus,
  resolveGunnyMovement,
  shapeSettingsResponse,
  validateNonNegativePercent,
  validatePercent,
  type OtrEvent,
} from '../shared/mill-intelligence';

const DRYING_STAGES = ['INTAKE', 'AFTER_DRYER', 'PRE_MILLING', 'OTHER'] as const;
const BAG_TYPES = ['JUTE', 'PP', 'OTHER'] as const;
const GUNNY_REASONS = ['RECEIVED', 'ISSUED', 'RETURNED', 'DAMAGED', 'MISSING', 'ADJUSTMENT'] as const;

function istToday(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function uuid(): string {
  return crypto.randomUUID();
}

async function audit(c: Context<AppEnv>, entityType: string, entityId: string, action: string, reason?: string) {
  const { mill, user } = c.get('session');
  await c.env.DB.prepare(
    `INSERT INTO audit_events (id, mill_id, actor_id, entity_type, entity_id, action, reason) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(uuid(), mill.id, user.id, entityType, entityId, action, reason || null)
    .run();
}

type SettingsRow = {
  otr_target_pct: number | null;
  otr_alert_delta_pct: number | null;
  moisture_min_pct: number | null;
  moisture_max_pct: number | null;
  head_rice_min_pct: number | null;
  broken_rice_max_pct: number | null;
};

type StandaloneRunRow = {
  id: string;
  run_date: string;
  shift: string | null;
  process_type_name: string | null;
  input_kg: number;
  main_output_kg: number;
};

async function loadGunnyOverview(db: D1Database, millId: string) {
  const [gunnyMovementsRes, gunnyBalanceRes, gateRes] = await db.batch([
    db.prepare(
      `SELECT g.*, ge.token_no AS gate_token_no
       FROM gunny_bag_movements g
       LEFT JOIN gate_entries ge ON ge.id = g.gate_entry_id AND ge.mill_id = g.mill_id
       WHERE g.mill_id = ?
       ORDER BY g.movement_date DESC, g.created_at DESC
       LIMIT 100`,
    ).bind(millId),
    db.prepare(
      `SELECT bag_type, capacity_kg,
              COALESCE(SUM(CASE WHEN direction = 'IN' THEN bag_count WHEN direction = 'OUT' THEN -bag_count ELSE 0 END), 0) AS balance
       FROM gunny_bag_movements
       WHERE mill_id = ?
       GROUP BY bag_type, capacity_kg
       ORDER BY bag_type, capacity_kg`,
    ).bind(millId),
    db.prepare(
      `SELECT id, token_no, vehicle_no, entry_date
       FROM gate_entries
       WHERE mill_id = ?
       ORDER BY entry_date DESC, created_at DESC
       LIMIT 50`,
    ).bind(millId),
  ]);

  return {
    balances: gunnyBalanceRes.results,
    movements: gunnyMovementsRes.results,
    gate_entries: gateRes.results,
  };
}

async function loadOtrEvents(db: D1Database, millId: string): Promise<OtrEvent[]> {
  const [standaloneRes, chainRunsRes, chainStepsRes, legacyRes] = await db.batch([
    db.prepare(
      `SELECT r.id, r.run_date, r.shift, pt.name AS process_type_name,
              COALESCE(SUM(CASE WHEN l.line_type = 'INPUT' THEN l.quantity_base ELSE 0 END), 0) AS input_kg,
              COALESCE(SUM(CASE WHEN l.line_type = 'OUTPUT' AND l.semantic_type = 'main' THEN l.quantity_base ELSE 0 END), 0) AS main_output_kg
       FROM process_runs r
       LEFT JOIN process_types pt ON pt.id = r.process_type_id
       LEFT JOIN process_run_lines l ON l.run_id = r.id AND l.mill_id = r.mill_id
       WHERE r.mill_id = ?1 AND r.status = 'POSTED' AND r.chain_run_id IS NULL
       GROUP BY r.id
       ORDER BY r.run_date DESC, r.created_at DESC
       LIMIT 200`,
    ).bind(millId),
    db.prepare(
      `SELECT cr.id, cr.start_date AS run_date, cr.status, pc.name AS chain_name
       FROM processing_chain_runs cr
       LEFT JOIN processing_chains pc ON pc.id = cr.chain_id
       WHERE cr.mill_id = ? AND cr.status != 'VOID'
         AND EXISTS (SELECT 1 FROM process_runs pr WHERE pr.chain_run_id = cr.id AND pr.mill_id = cr.mill_id AND pr.status = 'POSTED')
       ORDER BY cr.start_date DESC, cr.created_at DESC
       LIMIT 200`,
    ).bind(millId),
    db.prepare(
      `SELECT pr.chain_run_id, cs.step_number, pr.shift,
              COALESCE(SUM(CASE WHEN l.line_type = 'INPUT' THEN l.quantity_base ELSE 0 END), 0) AS input_kg,
              COALESCE(SUM(CASE WHEN l.line_type = 'OUTPUT' AND l.semantic_type = 'main' THEN l.quantity_base ELSE 0 END), 0) AS main_output_kg
       FROM process_runs pr
       JOIN processing_chain_steps cs ON cs.id = pr.chain_step_id AND cs.mill_id = pr.mill_id
       LEFT JOIN process_run_lines l ON l.run_id = pr.id AND l.mill_id = pr.mill_id
       WHERE pr.mill_id = ? AND pr.status = 'POSTED' AND pr.chain_run_id IS NOT NULL
       GROUP BY pr.chain_run_id, cs.step_number, pr.shift
       ORDER BY cs.step_number`,
    ).bind(millId),
    db.prepare(
      `SELECT pr.id, pr.run_date, pr.paddy_in_kg AS input_kg, pr.rice_out_kg AS main_output_kg
       FROM production_runs pr
       WHERE pr.mill_id = ?
         AND pr.paddy_in_kg > 0
         AND NOT EXISTS (
           SELECT 1 FROM process_runs r
           WHERE r.mill_id = pr.mill_id AND r.run_date = pr.run_date AND r.status = 'POSTED'
         )
       ORDER BY pr.run_date DESC, pr.created_at DESC
       LIMIT 200`,
    ).bind(millId),
  ]);

  const standaloneEvents: OtrEvent[] = (standaloneRes.results as StandaloneRunRow[]).map((row) => ({
    id: row.id,
    run_date: row.run_date,
    shift: row.shift,
    label: row.process_type_name ?? 'Standalone run',
    source_type: 'standalone',
    input_kg: row.input_kg,
    main_output_kg: row.main_output_kg,
  }));

  const chainEvents = buildChainOtrEvents(
    chainRunsRes.results as Array<{ id: string; run_date: string; chain_name: string | null; status: string }>,
    chainStepsRes.results as Array<{ chain_run_id: string; step_number: number; input_kg: number; main_output_kg: number; shift: string | null }>,
  );

  const legacyEvents: OtrEvent[] = (legacyRes.results as Array<{ id: string; run_date: string; input_kg: number; main_output_kg: number }>).map((row) => ({
    id: row.id,
    run_date: row.run_date,
    shift: null,
    label: 'Legacy production entry',
    source_type: 'legacy',
    input_kg: row.input_kg,
    main_output_kg: row.main_output_kg,
  }));

  return [...standaloneEvents, ...chainEvents, ...legacyEvents]
    .sort((a, b) => b.run_date.localeCompare(a.run_date) || b.id.localeCompare(a.id));
}

export function registerMillIntelligenceRoutes(api: Hono<AppEnv>) {
  api.get('/mill-intelligence/gunny-overview', async (c) => {
    const denied = denyUnlessCapability(c, 'gate:view');
    if (denied) return denied;
    const { mill } = c.get('session');
    return c.json({ gunny: await loadGunnyOverview(c.env.DB, mill.id) });
  });

  api.get('/mill-intelligence/overview', async (c) => {
    const denied = denyUnlessCapability(c, 'processing:view');
    if (denied) return denied;
    const { mill } = c.get('session');
    const db = c.env.DB;
    const today = istToday();
    const weekStart = istToday(-6);

    const [
      settingsRes,
      otrEvents,
      dryingRes,
      lotsRes,
      runsRes,
      chainRunsRes,
      qualityRes,
      gunny,
    ] = await Promise.all([
      db.prepare(`SELECT * FROM mill_intelligence_settings WHERE mill_id = ?`).bind(mill.id).all(),
      loadOtrEvents(db, mill.id),
      db.prepare(
        `SELECT dr.*, l.code AS lot_code, i.name AS item_name, pt.name AS process_type_name
         FROM drying_readings dr
         LEFT JOIN lots l ON l.id = dr.lot_id AND l.mill_id = dr.mill_id
         LEFT JOIN items i ON i.id = l.item_id
         LEFT JOIN process_runs pr ON pr.id = dr.process_run_id AND pr.mill_id = dr.mill_id
         LEFT JOIN process_types pt ON pt.id = pr.process_type_id
         WHERE dr.mill_id = ?
         ORDER BY dr.recorded_at DESC, dr.created_at DESC
         LIMIT 100`,
      ).bind(mill.id).all(),
      db.prepare(
        `SELECT l.id, l.code, l.qty_kg, i.name AS item_name
         FROM lots l
         LEFT JOIN items i ON i.id = l.item_id
         WHERE l.mill_id = ? AND l.qty_kg > 0
         ORDER BY l.in_date DESC, l.code DESC
         LIMIT 200`,
      ).bind(mill.id).all(),
      db.prepare(
        `SELECT r.id, r.run_date, r.shift, pt.name AS process_type_name
         FROM process_runs r
         LEFT JOIN process_types pt ON pt.id = r.process_type_id
         WHERE r.mill_id = ? AND r.status = 'POSTED'
         ORDER BY r.run_date DESC, r.created_at DESC
         LIMIT 100`,
      ).bind(mill.id).all(),
      db.prepare(
        `SELECT cr.id, cr.code, cr.start_date, cr.status, pc.name AS chain_name
         FROM processing_chain_runs cr
         LEFT JOIN processing_chains pc ON pc.id = cr.chain_id
         WHERE cr.mill_id = ? AND cr.status IN ('IN_PROGRESS', 'PAUSED', 'COMPLETED')
         ORDER BY cr.start_date DESC, cr.created_at DESC
         LIMIT 100`,
      ).bind(mill.id).all(),
      db.prepare(
        `SELECT qc.*,
                pt.name AS process_type_name,
                l.code AS lot_code,
                i.name AS item_name,
                cr.code AS chain_code,
                pc.name AS chain_name
         FROM quality_checks qc
         LEFT JOIN process_runs pr ON pr.id = qc.process_run_id AND pr.mill_id = qc.mill_id
         LEFT JOIN process_types pt ON pt.id = pr.process_type_id
         LEFT JOIN lots l ON l.id = qc.lot_id AND l.mill_id = qc.mill_id
         LEFT JOIN items i ON i.id = l.item_id
         LEFT JOIN processing_chain_runs cr ON cr.id = qc.chain_run_id AND cr.mill_id = qc.mill_id
         LEFT JOIN processing_chains pc ON pc.id = cr.chain_id
         WHERE qc.mill_id = ?
         ORDER BY qc.checked_at DESC, qc.created_at DESC
         LIMIT 100`,
      ).bind(mill.id).all(),
      loadGunnyOverview(db, mill.id),
    ]);

    const settingsRow = (settingsRes.results[0] as SettingsRow | undefined) ?? null;
    const settings = shapeSettingsResponse(settingsRow);
    const targetPct = settings.otr_target_pct;
    const alertDeltaPct = settings.otr_alert_delta_pct;
    const otr = buildOtrSummaries(otrEvents, today, weekStart, targetPct, alertDeltaPct);

    const moistureMin = settings.moisture_min_pct;
    const moistureMax = settings.moisture_max_pct;
    const dryingReadings = (dryingRes.results as Record<string, unknown>[]).map((row) => {
      const moisturePct = Number(row.moisture_pct);
      return {
        ...row,
        range_status: moistureRangeStatus(moisturePct, moistureMin, moistureMax),
      };
    });

    const qualityChecks = qualityRes.results as Record<string, unknown>[];
    const latestQuality = qualityChecks[0] ?? null;

    return c.json({
      settings,
      otr,
      drying: {
        readings: dryingReadings,
        lots: lotsRes.results,
        process_runs: runsRes.results,
      },
      quality: {
        latest: latestQuality
          ? {
              head_rice_pct: latestQuality.head_rice_pct,
              broken_rice_pct: latestQuality.broken_rice_pct,
              checked_at: latestQuality.checked_at,
            }
          : null,
        checks: qualityChecks,
        chain_runs: chainRunsRes.results,
        lots: lotsRes.results,
      },
      gunny,
    });
  });

  api.put('/mill-intelligence/settings', async (c) => {
    const denied = denyUnlessCapability(c, 'organisation:manage');
    if (denied) return denied;
    const { mill, user } = c.get('session');
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));

    const fields = [
      ['otr_target_pct', 'OTR target'],
      ['moisture_min_pct', 'Moisture minimum'],
      ['moisture_max_pct', 'Moisture maximum'],
      ['head_rice_min_pct', 'Head rice minimum'],
      ['broken_rice_max_pct', 'Broken rice maximum'],
    ] as const;
    const values: Record<string, number | null> = {};
    for (const [key, label] of fields) {
      if (b[key] == null || b[key] === '') {
        values[key] = null;
        continue;
      }
      const parsed = validatePercent(b[key], label);
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      values[key] = parsed.value;
    }

    if (b.otr_alert_delta_pct == null || b.otr_alert_delta_pct === '') {
      values.otr_alert_delta_pct = null;
    } else {
      const parsed = validateNonNegativePercent(b.otr_alert_delta_pct, 'OTR alert delta');
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      values.otr_alert_delta_pct = parsed.value;
    }

    if (values.moisture_min_pct != null && values.moisture_max_pct != null && values.moisture_min_pct > values.moisture_max_pct) {
      return c.json({ error: 'moisture minimum cannot exceed maximum' }, 400);
    }

    await c.env.DB.prepare(
      `INSERT INTO mill_intelligence_settings (
         mill_id, otr_target_pct, otr_alert_delta_pct, moisture_min_pct, moisture_max_pct,
         head_rice_min_pct, broken_rice_max_pct, updated_by, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(mill_id) DO UPDATE SET
         otr_target_pct = excluded.otr_target_pct,
         otr_alert_delta_pct = excluded.otr_alert_delta_pct,
         moisture_min_pct = excluded.moisture_min_pct,
         moisture_max_pct = excluded.moisture_max_pct,
         head_rice_min_pct = excluded.head_rice_min_pct,
         broken_rice_max_pct = excluded.broken_rice_max_pct,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
    )
      .bind(
        mill.id,
        values.otr_target_pct,
        values.otr_alert_delta_pct,
        values.moisture_min_pct,
        values.moisture_max_pct,
        values.head_rice_min_pct,
        values.broken_rice_max_pct,
        user.id,
      )
      .run();

    await audit(c, 'mill_intelligence_settings', mill.id, 'UPDATE');
    return c.json({ ok: true, settings: shapeSettingsResponse(values as SettingsRow) });
  });

  api.post('/mill-intelligence/drying-readings', async (c) => {
    const denied = denyUnlessCapability(c, 'processing:create');
    if (denied) return denied;
    const { mill, user } = c.get('session');
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));

    const lotId = String(b.lot_id ?? '').trim() || null;
    const processRunId = String(b.process_run_id ?? '').trim() || null;
    if (!lotId && !processRunId) return c.json({ error: 'lot_id or process_run_id is required' }, 400);

    const stage = String(b.stage ?? '').trim().toUpperCase();
    if (!DRYING_STAGES.includes(stage as (typeof DRYING_STAGES)[number])) {
      return c.json({ error: 'invalid stage' }, 400);
    }

    const moisture = validatePercent(b.moisture_pct, 'Moisture');
    if (!moisture.ok) return c.json({ error: moisture.error }, 400);

    const recordedAt = String(b.recorded_at ?? '').trim();
    if (!recordedAt) return c.json({ error: 'recorded_at is required' }, 400);

    if (lotId) {
      const lot = await c.env.DB.prepare(`SELECT id FROM lots WHERE id = ? AND mill_id = ?`).bind(lotId, mill.id).first();
      if (!lot) return c.json({ error: 'lot not found' }, 400);
    }
    if (processRunId) {
      const run = await c.env.DB.prepare(`SELECT id FROM process_runs WHERE id = ? AND mill_id = ?`).bind(processRunId, mill.id).first();
      if (!run) return c.json({ error: 'process run not found' }, 400);
    }

    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO drying_readings (id, mill_id, lot_id, process_run_id, stage, moisture_pct, recorded_at, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        mill.id,
        lotId,
        processRunId,
        stage,
        moisture.value,
        recordedAt,
        String(b.note ?? '').trim() || null,
        user.id,
      )
      .run();

    await audit(c, 'drying_reading', id, 'CREATE');
    return c.json({ id }, 201);
  });

  api.post('/mill-intelligence/quality-checks', async (c) => {
    const denied = denyUnlessCapability(c, 'processing:create');
    if (denied) return denied;
    const { mill, user } = c.get('session');
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));

    const lotId = String(b.lot_id ?? '').trim() || null;
    const chainRunId = String(b.chain_run_id ?? '').trim() || null;
    const processRunId = String(b.process_run_id ?? '').trim() || null;
    if (!lotId && !chainRunId && !processRunId) {
      return c.json({ error: 'chain_run_id, lot_id, or process_run_id is required' }, 400);
    }

    if (lotId) {
      const lot = await c.env.DB.prepare(`SELECT id FROM lots WHERE id = ? AND mill_id = ?`).bind(lotId, mill.id).first();
      if (!lot) return c.json({ error: 'lot not found' }, 400);
    }
    if (chainRunId) {
      const chainRun = await c.env.DB.prepare(
        `SELECT id FROM processing_chain_runs WHERE id = ? AND mill_id = ? AND status IN ('IN_PROGRESS', 'PAUSED', 'COMPLETED')`,
      ).bind(chainRunId, mill.id).first();
      if (!chainRun) return c.json({ error: 'active or completed chain run not found' }, 400);
    }
    if (processRunId) {
      const run = await c.env.DB.prepare(`SELECT id, status FROM process_runs WHERE id = ? AND mill_id = ?`)
        .bind(processRunId, mill.id)
        .first<{ id: string; status: string }>();
      if (!run) return c.json({ error: 'process run not found' }, 400);
      if (run.status !== 'POSTED') return c.json({ error: 'linked process run must be posted' }, 400);
    }

    const head = validatePercent(b.head_rice_pct, 'Head rice');
    if (!head.ok) return c.json({ error: head.error }, 400);
    const broken = validatePercent(b.broken_rice_pct, 'Broken rice');
    if (!broken.ok) return c.json({ error: broken.error }, 400);
    if (head.value + broken.value > 100) return c.json({ error: 'head rice and broken rice cannot exceed 100%' }, 400);

    const checkedAt = String(b.checked_at ?? '').trim();
    if (!checkedAt) return c.json({ error: 'checked_at is required' }, 400);

    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO quality_checks (id, mill_id, process_run_id, lot_id, chain_run_id, checked_at, shift, head_rice_pct, broken_rice_pct, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        mill.id,
        processRunId,
        lotId,
        chainRunId,
        checkedAt,
        String(b.shift ?? '').trim() || null,
        head.value,
        broken.value,
        String(b.note ?? '').trim() || null,
        user.id,
      )
      .run();

    await audit(c, 'quality_check', id, 'CREATE');
    return c.json({ id }, 201);
  });

  api.post('/mill-intelligence/gunny-bag-movements', async (c) => {
    const denied = denyUnlessCapability(c, 'gate:create');
    if (denied) return denied;
    const { mill, user } = c.get('session');
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));

    const bagType = String(b.bag_type ?? '').trim().toUpperCase();
    if (!BAG_TYPES.includes(bagType as (typeof BAG_TYPES)[number])) return c.json({ error: 'invalid bag_type' }, 400);

    const reason = String(b.reason ?? '').trim().toUpperCase();
    if (!GUNNY_REASONS.includes(reason as (typeof GUNNY_REASONS)[number])) return c.json({ error: 'invalid reason' }, 400);

    const directionResult = resolveGunnyMovement(reason, String(b.direction ?? ''));
    if (!directionResult.ok) return c.json({ error: directionResult.error }, 400);
    const direction = directionResult.direction;

    const bagCount = Number(b.bag_count);
    if (!Number.isInteger(bagCount) || bagCount <= 0) return c.json({ error: 'bag_count must be a positive integer' }, 400);

    let capacityKg: number | null = null;
    if (b.capacity_kg != null && b.capacity_kg !== '') {
      capacityKg = Number(b.capacity_kg);
      if (!Number.isFinite(capacityKg) || capacityKg <= 0) return c.json({ error: 'capacity_kg must be positive when supplied' }, 400);
      capacityKg = Math.round(capacityKg);
    }

    const movementDate = String(b.movement_date ?? '').trim() || istToday();
    const gateEntryId = String(b.gate_entry_id ?? '').trim() || null;
    if (gateEntryId) {
      const gate = await c.env.DB.prepare(`SELECT id FROM gate_entries WHERE id = ? AND mill_id = ?`).bind(gateEntryId, mill.id).first();
      if (!gate) return c.json({ error: 'gate entry not found' }, 400);
    }

    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO gunny_bag_movements (
         id, mill_id, gate_entry_id, bag_type, capacity_kg, direction, reason, bag_count, movement_date, note, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        mill.id,
        gateEntryId,
        bagType,
        capacityKg,
        direction,
        reason,
        bagCount,
        movementDate,
        String(b.note ?? '').trim() || null,
        user.id,
      )
      .run();

    await audit(c, 'gunny_bag_movement', id, 'CREATE');
    return c.json({ id }, 201);
  });
}
