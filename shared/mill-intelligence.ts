export const MILL_INTELLIGENCE_SUGGESTED_DEFAULTS = {
  otr_target_pct: 65,
  otr_alert_delta_pct: 1,
  moisture_min_pct: 13,
  moisture_max_pct: 14,
  head_rice_min_pct: 85,
  broken_rice_max_pct: 15,
} as const;

export type MillIntelligenceSettingsValues = {
  otr_target_pct: number | null;
  otr_alert_delta_pct: number | null;
  moisture_min_pct: number | null;
  moisture_max_pct: number | null;
  head_rice_min_pct: number | null;
  broken_rice_max_pct: number | null;
};

export type MoistureRangeStatus = 'below' | 'within' | 'above' | 'unknown';

export function computeOtrPct(inputKg: number, mainOutputKg: number): number | null {
  if (!(inputKg > 0)) return null;
  return Math.round((mainOutputKg / inputKg) * 1000) / 10;
}

export function otrVariancePct(actualOtrPct: number | null, targetPct: number | null): number | null {
  if (actualOtrPct == null || targetPct == null) return null;
  return Math.round((actualOtrPct - targetPct) * 10) / 10;
}

export function otrAlertThreshold(targetPct: number | null, alertDeltaPct: number | null): number | null {
  if (targetPct == null || alertDeltaPct == null) return null;
  return Math.round((targetPct - alertDeltaPct) * 10) / 10;
}

export function isOtrBelowAlert(actualOtrPct: number | null, targetPct: number | null, alertDeltaPct: number | null): boolean {
  const threshold = otrAlertThreshold(targetPct, alertDeltaPct);
  if (actualOtrPct == null || threshold == null) return false;
  return actualOtrPct < threshold;
}

export function moistureRangeStatus(moisturePct: number, minPct: number | null, maxPct: number | null): MoistureRangeStatus {
  if (minPct == null && maxPct == null) return 'unknown';
  if (minPct != null && moisturePct < minPct) return 'below';
  if (maxPct != null && moisturePct > maxPct) return 'above';
  return 'within';
}

export function qualityCheckWarnings(
  headPct: number,
  brokenPct: number,
  headMin: number | null,
  brokenMax: number | null,
): { headLow: boolean; brokenHigh: boolean } {
  return {
    headLow: headMin != null && headPct < headMin,
    brokenHigh: brokenMax != null && brokenPct > brokenMax,
  };
}

export function gunnyMovementDelta(direction: 'IN' | 'OUT', bagCount: number): number {
  return direction === 'IN' ? bagCount : -bagCount;
}

export type GunnyReason = 'RECEIVED' | 'ISSUED' | 'RETURNED' | 'DAMAGED' | 'MISSING' | 'ADJUSTMENT';
export type GunnyDirection = 'IN' | 'OUT';

/** Fixed direction for each reason; ADJUSTMENT allows either direction. */
export const GUNNY_REASON_DIRECTION: Record<GunnyReason, GunnyDirection | 'EITHER'> = {
  RECEIVED: 'IN',
  RETURNED: 'IN',
  ISSUED: 'OUT',
  DAMAGED: 'OUT',
  MISSING: 'OUT',
  ADJUSTMENT: 'EITHER',
};

export function resolveGunnyMovement(
  reason: string,
  requestedDirection?: string,
): { ok: true; direction: GunnyDirection } | { ok: false; error: string } {
  const normalizedReason = String(reason ?? '').trim().toUpperCase() as GunnyReason;
  if (!(normalizedReason in GUNNY_REASON_DIRECTION)) {
    return { ok: false, error: 'invalid reason' };
  }
  const rule = GUNNY_REASON_DIRECTION[normalizedReason];
  if (rule === 'EITHER') {
    const direction = String(requestedDirection ?? '').trim().toUpperCase();
    if (direction !== 'IN' && direction !== 'OUT') {
      return { ok: false, error: 'direction is required for adjustment movements' };
    }
    return { ok: true, direction };
  }
  const requested = String(requestedDirection ?? '').trim().toUpperCase();
  if (requested && requested !== rule) {
    return { ok: false, error: `${normalizedReason} movements must be recorded as ${rule}` };
  }
  return { ok: true, direction: rule };
}

export type OtrSourceType = 'standalone' | 'chain' | 'legacy';

export type OtrEvent = {
  id: string;
  run_date: string;
  shift: string | null;
  label: string;
  source_type: OtrSourceType;
  input_kg: number;
  main_output_kg: number;
};

export function buildOtrSummaries(
  events: OtrEvent[],
  today: string,
  weekStart: string,
  targetPct: number | null,
  alertDeltaPct: number | null,
) {
  const recentRuns = events
    .filter((event) => event.input_kg > 0 || event.main_output_kg > 0)
    .slice(0, 30)
    .map((event) => {
      const actualOtrPct = computeOtrPct(event.input_kg, event.main_output_kg);
      return {
        id: event.id,
        run_date: event.run_date,
        shift: event.shift,
        process_type_name: event.label,
        source_type: event.source_type,
        input_kg: event.input_kg,
        main_output_kg: event.main_output_kg,
        actual_otr_pct: actualOtrPct,
        target_pct: targetPct,
        variance_pct: otrVariancePct(actualOtrPct, targetPct),
        alert: isOtrBelowAlert(actualOtrPct, targetPct, alertDeltaPct),
      };
    });

  const todayEvents = events.filter((event) => event.run_date === today);
  const todayInputKg = todayEvents.reduce((sum, event) => sum + event.input_kg, 0);
  const todayMainOutputKg = todayEvents.reduce((sum, event) => sum + event.main_output_kg, 0);
  const todayActualOtrPct = computeOtrPct(todayInputKg, todayMainOutputKg);

  const dailyMap = new Map<string, { input_kg: number; main_output_kg: number }>();
  for (const event of events) {
    if (event.run_date < weekStart) continue;
    const slot = dailyMap.get(event.run_date) ?? { input_kg: 0, main_output_kg: 0 };
    slot.input_kg += event.input_kg;
    slot.main_output_kg += event.main_output_kg;
    dailyMap.set(event.run_date, slot);
  }
  const daily = [...dailyMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, totals]) => ({
      date,
      input_kg: totals.input_kg,
      main_output_kg: totals.main_output_kg,
      actual_otr_pct: computeOtrPct(totals.input_kg, totals.main_output_kg),
    }));

  return {
    today: {
      input_kg: todayInputKg,
      main_output_kg: todayMainOutputKg,
      actual_otr_pct: todayActualOtrPct,
      target_pct: targetPct,
      variance_pct: otrVariancePct(todayActualOtrPct, targetPct),
      alert: isOtrBelowAlert(todayActualOtrPct, targetPct, alertDeltaPct),
    },
    recent_runs: recentRuns,
    daily,
  };
}

export function buildChainOtrEvents(
  chainRuns: Array<{ id: string; run_date: string; chain_name: string | null; status: string }>,
  stepTotals: Array<{ chain_run_id: string; step_number: number; input_kg: number; main_output_kg: number; shift: string | null }>,
): OtrEvent[] {
  const byChain = new Map<string, typeof stepTotals>();
  for (const row of stepTotals) {
    const list = byChain.get(row.chain_run_id) ?? [];
    list.push(row);
    byChain.set(row.chain_run_id, list);
  }

  return chainRuns.flatMap((chainRun) => {
    const steps = (byChain.get(chainRun.id) ?? []).sort((a, b) => a.step_number - b.step_number);
    if (!steps.length) return [];
    const first = steps[0];
    const last = steps[steps.length - 1];
    const inputKg = first.input_kg;
    const mainOutputKg = last.main_output_kg;
    if (!(inputKg > 0) && !(mainOutputKg > 0)) return [];
    return [{
      id: chainRun.id,
      run_date: chainRun.run_date,
      shift: last.shift ?? first.shift,
      label: chainRun.chain_name ? `Chain · ${chainRun.chain_name}` : 'Processing chain',
      source_type: 'chain' as const,
      input_kg: inputKg,
      main_output_kg: mainOutputKg,
    }];
  });
}

export function parseOptionalPercent(value: unknown): number | null {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 10) / 10;
}

export function validatePercent(value: unknown, field: string): { ok: true; value: number } | { ok: false; error: string } {
  const parsed = parseOptionalPercent(value);
  if (parsed == null) return { ok: false, error: `${field} must be between 0 and 100` };
  if (parsed < 0 || parsed > 100) return { ok: false, error: `${field} must be between 0 and 100` };
  return { ok: true, value: parsed };
}

export function validateNonNegativePercent(value: unknown, field: string): { ok: true; value: number } | { ok: false; error: string } {
  const parsed = parseOptionalPercent(value);
  if (parsed == null) return { ok: false, error: `${field} must be a non-negative number` };
  if (parsed < 0 || parsed > 100) return { ok: false, error: `${field} must be between 0 and 100` };
  return { ok: true, value: parsed };
}

export function shapeSettingsResponse(row: MillIntelligenceSettingsValues | null) {
  const configured = row != null;
  return {
    configured,
    otr_target_pct: row?.otr_target_pct ?? null,
    otr_alert_delta_pct: row?.otr_alert_delta_pct ?? null,
    moisture_min_pct: row?.moisture_min_pct ?? null,
    moisture_max_pct: row?.moisture_max_pct ?? null,
    head_rice_min_pct: row?.head_rice_min_pct ?? null,
    broken_rice_max_pct: row?.broken_rice_max_pct ?? null,
    suggested: { ...MILL_INTELLIGENCE_SUGGESTED_DEFAULTS },
  };
}
