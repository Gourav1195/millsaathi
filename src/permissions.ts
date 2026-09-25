import type { Context } from 'hono';
import type { AppEnv } from './index';
import {
  type Capability,
  type SessionUser,
  canViewFinance,
  capabilitiesFor,
  effectiveRole,
  hasCapability,
} from '../shared/permissions';

export {
  CAPABILITIES,
  CAPABILITY_LABELS,
  NAV_MODULE_CAPABILITY,
  ROLE_CAPABILITIES,
  ROLE_LABELS,
  ROLES,
  canAccessNav,
  canAssignRole,
  canManageTeam,
  canViewFinance,
  capabilitiesFor,
  effectiveRole,
  groupCapabilitiesForDisplay,
  hasAnyCapability,
  hasCapability,
  isOwnerRole,
} from '../shared/permissions';
export type { Capability, NavModule, Role, SessionUser } from '../shared/permissions';

const FINANCE_KEY_PATTERNS = [
  /paise/i,
  /_rate$/i,
  /^rate_/i,
  /balance/i,
  /outstanding/i,
  /receivable/i,
  /payable/i,
  /advance/i,
  /commission/i,
  /gst/i,
  /cgst/i,
  /sgst/i,
  /igst/i,
  /cess/i,
  /taxable/i,
  /subtotal/i,
  /discount/i,
  /margin/i,
  /billing/i,
  /cash_paid/i,
  /cash_received/i,
  /sale_value/i,
  /purchase_value/i,
  /stock_value/i,
  /gross_margin/i,
  /value_paise/i,
  /paid_paise/i,
  /amount_paise/i,
  /total_paise/i,
];

function isFinanceKey(key: string): boolean {
  return FINANCE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/** Strip finance-sensitive keys from nested API payloads. */
export function redactFinanceData<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => redactFinanceData(entry)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (!isFinanceKey(key)) out[key] = redactFinanceData(child);
    }
    return out as T;
  }
  return value;
}

export function denyUnlessCapability(c: Context<AppEnv>, capability: Capability): Response | null {
  const user = c.get('session').user;
  return hasCapability(user, capability) ? null : c.json({ error: 'not allowed for this role' }, 403);
}

export function applyFinancePolicy<T>(user: SessionUser, payload: T): T {
  return canViewFinance(user) ? payload : redactFinanceData(payload);
}

function slimParty(row: Record<string, unknown>) {
  return { id: row.id, name: row.name, type: row.type, place: row.place, location: row.location, phone: row.phone };
}

function slimItem(row: Record<string, unknown>) {
  return { id: row.id, name: row.name, category: row.category, category_code: row.category_code, unit: row.unit, base_unit: row.base_unit, display_unit: row.display_unit };
}

function slimSauda(row: Record<string, unknown>) {
  return {
    id: row.id,
    code: row.code,
    direction: row.direction,
    supplier_id: row.supplier_id,
    buyer_id: row.buyer_id,
    item_id: row.item_id,
    qty_kg: row.qty_kg,
    agreed_quantity: row.agreed_quantity,
    agreed_unit: row.agreed_unit,
    fulfilled_qty_base: row.fulfilled_qty_base,
    status: row.status,
    fulfilment_status: row.fulfilment_status,
    supplier_name: row.supplier_name,
    buyer_name: row.buyer_name,
    item_name: row.item_name,
  };
}

function slimLot(row: Record<string, unknown>) {
  const copy = { ...row };
  delete copy.value_paise;
  return copy;
}

/** Shape the monolithic overview payload to the caller's role. */
export function shapeOverviewPayload(user: SessionUser, body: Record<string, unknown>): Record<string, unknown> {
  const role = effectiveRole(user);
  const baseMe = body.me as Record<string, unknown> | undefined;
  const me = baseMe
    ? {
        ...baseMe,
        role: effectiveRole(user),
        capabilities: capabilitiesFor(user),
      }
    : baseMe;

  if (role === 'gate_operator') {
    return applyFinancePolicy(user, {
      me,
      mill: {
        id: (body.mill as Record<string, unknown>)?.id,
        name: (body.mill as Record<string, unknown>)?.name,
        season_label: (body.mill as Record<string, unknown>)?.season_label,
        loss_limit_pct: (body.mill as Record<string, unknown>)?.loss_limit_pct,
      },
      today: body.today,
      kpis: body.kpis,
      trend: body.trend,
      alerts: body.alerts,
      gate: body.gate,
      suppliers: (body.suppliers as Record<string, unknown>[] | undefined)?.map(slimParty) ?? [],
      buyers: (body.buyers as Record<string, unknown>[] | undefined)?.map(slimParty) ?? [],
      items: (body.items as Record<string, unknown>[] | undefined)?.map(slimItem) ?? [],
      saudas: (body.saudas as Record<string, unknown>[] | undefined)?.map(slimSauda) ?? [],
      onboarding: body.onboarding,
    });
  }

  if (role === 'production_operator') {
    return applyFinancePolicy(user, {
      me,
      mill: body.mill,
      today: body.today,
      kpis: body.kpis,
      trend: body.trend,
      alerts: body.alerts,
      items: (body.items as Record<string, unknown>[] | undefined)?.map(slimItem) ?? [],
      lots: (body.lots as Record<string, unknown>[] | undefined)?.map(slimLot) ?? [],
      godowns: body.godowns,
      stock_by_item: body.stock_by_item,
      item_flows: body.item_flows,
      processing_summary: body.processing_summary,
      processing_today: body.processing_today,
      production: body.production,
      mass_balance: body.mass_balance,
      active_chain_runs: body.active_chain_runs,
      chain_yield_summary: body.chain_yield_summary,
      onboarding: body.onboarding,
    });
  }

  if (role === 'accountant') {
    return applyFinancePolicy(user, {
      me,
      mill: body.mill,
      today: body.today,
      kpis: body.kpis,
      suppliers: body.suppliers,
      buyers: body.buyers,
      saudas: body.saudas,
      items: (body.items as Record<string, unknown>[] | undefined)?.map(slimItem) ?? [],
      stock_by_item: body.stock_by_item,
      gate: (body.gate as Record<string, unknown>[] | undefined)?.map((row) => ({
        id: row.id,
        token_no: row.token_no,
        direction: row.direction,
        vehicle_no: row.vehicle_no,
        status: row.status,
        entry_date: row.entry_date,
        supplier_name: row.supplier_name,
        buyer_name: row.buyer_name,
        item_name: row.item_name,
        net_kg: row.net_kg,
      })) ?? [],
      alerts: body.alerts,
      onboarding: body.onboarding,
    });
  }

  if (role === 'viewer') {
    const redacted = applyFinancePolicy(user, { ...body, me }) as Record<string, unknown>;
    delete redacted.saudas;
    return redacted;
  }

  if (role === 'manager' || role === 'operator') {
    const redacted = applyFinancePolicy(user, { ...body, me }) as Record<string, unknown>;
    delete redacted.saudas;
    return redacted;
  }

  return applyFinancePolicy(user, { ...body, me, capabilities: capabilitiesFor(user) });
}

/** @deprecated use redactFinanceData */
export function stripMoney<T>(value: T): T {
  return redactFinanceData(value);
}

export function masterCreateCapability(master: string): Capability {
  if (master === 'items') return 'items:create';
  if (master === 'godowns') return 'stock:create';
  return 'parties:create';
}

export function masterEditCapability(master: string): Capability {
  if (master === 'items') return 'items:edit';
  if (master === 'godowns') return 'stock:edit';
  return 'parties:edit';
}

export function masterArchiveCapability(master: string): Capability {
  if (master === 'items') return 'items:archive';
  if (master === 'godowns') return 'stock:edit';
  return 'parties:archive';
}
