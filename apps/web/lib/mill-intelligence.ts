import type { MILL_INTELLIGENCE_SUGGESTED_DEFAULTS } from '../../../shared/mill-intelligence';

export type MillIntelligenceSettings = {
  configured: boolean;
  otr_target_pct: number | null;
  otr_alert_delta_pct: number | null;
  moisture_min_pct: number | null;
  moisture_max_pct: number | null;
  head_rice_min_pct: number | null;
  broken_rice_max_pct: number | null;
  suggested: typeof MILL_INTELLIGENCE_SUGGESTED_DEFAULTS;
};

export type GunnyOverview = {
  balances: Array<{ bag_type: string; capacity_kg: number | null; balance: number }>;
  movements: Array<Record<string, unknown>>;
  gate_entries: Array<{ id: string; token_no?: string; vehicle_no?: string; entry_date?: string }>;
};

export type MillIntelligenceOverview = {
  settings: MillIntelligenceSettings;
  otr: {
    today: {
      input_kg: number;
      main_output_kg: number;
      actual_otr_pct: number | null;
      target_pct: number | null;
      variance_pct: number | null;
      alert: boolean;
    };
    recent_runs: Array<{
      id: string;
      run_date: string;
      shift: string | null;
      process_type_name: string | null;
      source_type?: 'standalone' | 'chain' | 'legacy';
      input_kg: number;
      main_output_kg: number;
      actual_otr_pct: number | null;
      target_pct: number | null;
      variance_pct: number | null;
      alert: boolean;
    }>;
    daily: Array<{
      date: string;
      input_kg: number;
      main_output_kg: number;
      actual_otr_pct: number | null;
    }>;
  };
  drying: {
    readings: Array<Record<string, unknown> & { range_status?: string }>;
    lots: Array<{ id: string; code: string; qty_kg: number; item_name?: string | null }>;
    process_runs: Array<{ id: string; run_date: string; shift?: string | null; process_type_name?: string | null }>;
  };
  quality: {
    latest: { head_rice_pct: number; broken_rice_pct: number; checked_at: string } | null;
    checks: Array<Record<string, unknown>>;
    chain_runs: Array<{ id: string; code?: string; start_date?: string; status?: string; chain_name?: string | null }>;
    lots: Array<{ id: string; code: string; qty_kg: number; item_name?: string | null }>;
  };
  gunny: GunnyOverview;
};

export async function fetchMillIntelligenceOverview(): Promise<MillIntelligenceOverview> {
  const response = await fetch('/api/mill-intelligence/overview', { credentials: 'include' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Could not load Mill Intelligence');
  return body as MillIntelligenceOverview;
}

export async function fetchGunnyOverview(): Promise<GunnyOverview> {
  const response = await fetch('/api/mill-intelligence/gunny-overview', { credentials: 'include' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Could not load gunny bag data');
  return (body as { gunny: GunnyOverview }).gunny;
}
