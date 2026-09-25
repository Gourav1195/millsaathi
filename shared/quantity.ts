// Pure quantity arithmetic shared by Worker API and Next.js UI.

export const TRACKING_MODES = ['WEIGHT_ONLY', 'VARIABLE_BAG', 'FIXED_PACKAGE', 'COUNT_ONLY'] as const;
export type TrackingMode = (typeof TRACKING_MODES)[number];

export const WEIGHT_SOURCES = ['WEIGHED', 'DERIVED', 'MANUAL'] as const;
export type WeightSource = (typeof WEIGHT_SOURCES)[number];

export const DISPLAY_UNITS = ['KG', 'QUINTAL', 'TONNE'] as const;
export type DisplayUnit = (typeof DISPLAY_UNITS)[number];

export const RATE_UNITS = ['QTL', 'BAG', 'KG', 'PIECE'] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

const UNIT_TO_KG: Record<string, number> = { KG: 1, QUINTAL: 100, TONNE: 1000 };

export type ItemTrackingConfig = {
  tracking_mode: TrackingMode;
  display_unit?: string | null;
  package_unit?: string | null;
  package_quantity_base?: number | null;
  gate_bag_count_required?: boolean | number | null;
  default_rate_unit?: string | null;
};

export function isTrackingMode(value: unknown): value is TrackingMode {
  return typeof value === 'string' && (TRACKING_MODES as readonly string[]).includes(value);
}

export function trackingModeLabel(mode: TrackingMode): string {
  switch (mode) {
    case 'WEIGHT_ONLY': return 'Weight only';
    case 'VARIABLE_BAG': return 'Weight + variable bags';
    case 'FIXED_PACKAGE': return 'Fixed package';
    case 'COUNT_ONLY': return 'Count only';
    default: return mode;
  }
}

export function validateItemTrackingConfig(config: ItemTrackingConfig): string | null {
  const mode = config.tracking_mode;
  if (!isTrackingMode(mode)) return 'invalid tracking mode';

  const displayUnit = String(config.display_unit ?? 'QUINTAL').trim().toUpperCase();
  const packageUnit = config.package_unit ? String(config.package_unit).trim().toUpperCase() : null;
  const packageQty = Number(config.package_quantity_base);

  switch (mode) {
    case 'WEIGHT_ONLY':
      if (!DISPLAY_UNITS.includes(displayUnit as DisplayUnit)) return 'invalid display unit';
      if (packageUnit) return 'weight-only items must not use package units';
      return null;
    case 'VARIABLE_BAG':
      if (!DISPLAY_UNITS.includes(displayUnit as DisplayUnit)) return 'invalid display unit';
      if (packageUnit || (Number.isFinite(packageQty) && packageQty > 0)) {
        return 'variable-bag items must not have a fixed package weight';
      }
      return null;
    case 'FIXED_PACKAGE':
      if (!packageUnit || !['BAG', 'PIECE'].includes(packageUnit)) return 'fixed package requires BAG or PIECE package unit';
      if (!Number.isFinite(packageQty) || packageQty <= 0) return 'declared package weight must be positive';
      return null;
    case 'COUNT_ONLY':
      if (packageUnit !== 'PIECE') return 'count-only items require PIECE package unit';
      if (!Number.isFinite(packageQty) || packageQty <= 0) return 'count unit must be configured';
      return null;
    default:
      return 'invalid tracking mode';
  }
}

export function normalizeItemTrackingPayload(body: Record<string, unknown>, creating = false): string | null {
  const mode = String(body.tracking_mode ?? 'WEIGHT_ONLY').trim().toUpperCase() as TrackingMode;
  if (!isTrackingMode(mode)) return 'invalid tracking mode';
  body.tracking_mode = mode;

  if (creating || body.gate_bag_count_required != null) {
    body.gate_bag_count_required = mode === 'VARIABLE_BAG'
      ? (body.gate_bag_count_required === false || body.gate_bag_count_required === 0 ? 0 : 1)
      : 0;
  }

  if (mode === 'WEIGHT_ONLY' || mode === 'VARIABLE_BAG') {
    if (creating || body.display_unit != null) {
      body.display_unit = String(body.display_unit ?? 'QUINTAL').trim().toUpperCase();
    }
    body.package_unit = null;
    body.package_quantity_base = null;
  } else if (mode === 'FIXED_PACKAGE') {
    if (creating || body.package_unit != null) body.package_unit = String(body.package_unit ?? 'BAG').trim().toUpperCase();
    if (creating || body.display_unit != null) {
      body.display_unit = String(body.display_unit ?? 'QUINTAL').trim().toUpperCase();
    }
  } else if (mode === 'COUNT_ONLY') {
    body.package_unit = 'PIECE';
    if (creating || body.package_quantity_base == null) body.package_quantity_base = 1;
    body.display_unit = null;
  }

  if (body.default_rate_unit != null && body.default_rate_unit !== '') {
    body.default_rate_unit = String(body.default_rate_unit).trim().toUpperCase();
  } else if (creating) {
    body.default_rate_unit = mode === 'VARIABLE_BAG' ? 'QTL'
      : mode === 'FIXED_PACKAGE' ? 'BAG'
      : mode === 'COUNT_ONLY' ? 'PIECE'
      : 'QTL';
  }

  return validateItemTrackingConfig({
    tracking_mode: mode,
    display_unit: body.display_unit as string | null,
    package_unit: body.package_unit as string | null,
    package_quantity_base: body.package_quantity_base as number | null,
    gate_bag_count_required: body.gate_bag_count_required as number | null,
    default_rate_unit: body.default_rate_unit as string | null,
  });
}

export function deriveAverageKgPerBag(weightKg: number, bagCount: number | null | undefined): number | null {
  if (bagCount == null || !Number.isInteger(bagCount) || bagCount <= 0) return null;
  if (!Number.isFinite(weightKg) || weightKg < 0) return null;
  return Math.round((weightKg / bagCount) * 100) / 100;
}

export function fixedPackageKg(packageCount: number, declaredKgPerPack: number): number {
  if (!Number.isInteger(packageCount) || packageCount <= 0) return 0;
  if (!Number.isFinite(declaredKgPerPack) || declaredKgPerPack <= 0) return 0;
  return Math.round(packageCount * declaredKgPerPack);
}

export function allocateProportionalKg(totalKg: number, lineBags: number[], totalBags: number): number[] {
  if (!lineBags.length) return [];
  if (!Number.isInteger(totalKg) || totalKg < 0) throw new Error('totalKg must be a non-negative integer');
  if (!Number.isInteger(totalBags) || totalBags <= 0) throw new Error('totalBags must be a positive integer');
  const bagSum = lineBags.reduce((sum, bags) => sum + bags, 0);
  if (bagSum !== totalBags) throw new Error('line bags must sum to total bags');

  const allocations: number[] = [];
  let allocated = 0;
  for (let index = 0; index < lineBags.length; index += 1) {
    const isLast = index === lineBags.length - 1;
    const bags = lineBags[index];
    if (!Number.isInteger(bags) || bags < 0) throw new Error('each line needs a non-negative whole bag count');
    const kg = isLast ? totalKg - allocated : Math.round((totalKg * bags) / totalBags);
    allocations.push(kg);
    allocated += kg;
  }
  return allocations;
}

export function validateDualBalance(
  remainingKg: number,
  remainingBags: number | null,
  deltaKg: number,
  deltaBags: number | null,
): string | null {
  if (deltaKg < 0 || remainingKg - deltaKg < 0) return 'insufficient remaining weight';
  if (remainingBags != null && deltaBags != null && remainingBags - deltaBags < 0) {
    return 'insufficient remaining bags';
  }
  return null;
}

export function weightToDisplay(weightKg: number, displayUnit: string): number {
  const unit = String(displayUnit ?? 'KG').trim().toUpperCase();
  const divisor = UNIT_TO_KG[unit] ?? 1;
  return Math.round((weightKg / divisor) * 100) / 100;
}

export function displayToKg(quantity: number, displayUnit: string): number {
  const unit = String(displayUnit ?? 'KG').trim().toUpperCase();
  const multiplier = UNIT_TO_KG[unit] ?? 1;
  return Math.round(quantity * multiplier);
}

export function formatWeightDisplay(weightKg: number, displayUnit = 'QUINTAL'): string {
  const value = weightToDisplay(weightKg, displayUnit);
  const unit = String(displayUnit).trim().toUpperCase();
  const suffix = unit === 'QUINTAL' ? 'qtl' : unit === 'TONNE' ? 't' : 'kg';
  return `${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${suffix}`;
}

export function formatBagCount(bagCount: number | null | undefined): string | null {
  if (bagCount == null) return null;
  return `${bagCount.toLocaleString('en-IN')} bag${bagCount === 1 ? '' : 's'}`;
}

export function formatDualQuantity(params: {
  weightKg?: number | null;
  bagCount?: number | null;
  pieceCount?: number | null;
  displayUnit?: string | null;
  trackingMode?: TrackingMode | null;
}): string {
  const mode = params.trackingMode ?? 'WEIGHT_ONLY';
  if (mode === 'COUNT_ONLY') {
    const pieces = params.pieceCount ?? params.bagCount;
    if (pieces == null) return '—';
    return `${pieces.toLocaleString('en-IN')} piece${pieces === 1 ? '' : 's'}`;
  }

  const parts: string[] = [];
  if (params.weightKg != null && params.weightKg >= 0) {
    parts.push(formatWeightDisplay(params.weightKg, params.displayUnit ?? 'QUINTAL'));
  }
  const bagLabel = formatBagCount(params.bagCount);
  if (bagLabel) parts.push(bagLabel);
  if (!parts.length) return '—';
  return parts.join(' | ');
}

export function calculateCommercialValue(params: {
  qtyKg: number;
  bagCount?: number | null;
  pieceCount?: number | null;
  rateInr: number;
  rateUnit: RateUnit | string;
}): number {
  const ratePaise = Math.round(params.rateInr * 100);
  const unit = String(params.rateUnit).trim().toUpperCase();
  if (unit === 'BAG') return Math.round((params.bagCount ?? 0) * ratePaise);
  if (unit === 'PIECE') return Math.round((params.pieceCount ?? 0) * ratePaise);
  if (unit === 'KG') return Math.round(params.qtyKg * ratePaise);
  return Math.round(params.qtyKg * (ratePaise / 100));
}

/** Inverse of calculateCommercialValue — derive stored rate from an entered total deal value. */
export function deriveRatePaiseFromTotalValue(params: {
  totalValuePaise: number;
  qtyKg: number;
  quantity: number;
  unit: string;
}): number {
  const total = Math.round(params.totalValuePaise);
  if (!Number.isFinite(total) || total < 0) return 0;
  const unit = String(params.unit).trim().toUpperCase();
  if (unit === 'BAG' || unit === 'PIECE') {
    const count = Math.round(params.quantity);
    if (count <= 0) return 0;
    return Math.round(total / count);
  }
  if (unit === 'KG') {
    if (params.qtyKg <= 0) return 0;
    return Math.round(total / params.qtyKg);
  }
  if (params.qtyKg <= 0) return 0;
  return Math.round((total * 100) / params.qtyKg);
}

export function rejectVariableBagFixedConversion(trackingMode: TrackingMode, unit: string): boolean {
  return trackingMode === 'VARIABLE_BAG' && String(unit).trim().toUpperCase() === 'BAG';
}

export function itemUsesVariableBags(mode: TrackingMode | string | null | undefined): boolean {
  return String(mode ?? '').trim().toUpperCase() === 'VARIABLE_BAG';
}

export function itemUsesFixedPackage(mode: TrackingMode | string | null | undefined): boolean {
  return String(mode ?? '').trim().toUpperCase() === 'FIXED_PACKAGE';
}

export function itemIsCountOnly(mode: TrackingMode | string | null | undefined): boolean {
  return String(mode ?? '').trim().toUpperCase() === 'COUNT_ONLY';
}

export function gateRequiresBagCount(item: ItemTrackingConfig): boolean {
  return item.tracking_mode === 'VARIABLE_BAG' && Boolean(item.gate_bag_count_required ?? true);
}

export type NormalizeQuantityResult = {
  quantity: number;
  unit: string;
  base: number;
  baseUnit: string;
  bagCount?: number | null;
};

export function normalizeWeightQuantity(quantity: unknown, unit: unknown): NormalizeQuantityResult | null {
  const value = Number(quantity);
  const normalizedUnit = String(unit ?? 'KG').trim().toUpperCase();
  const multiplier = UNIT_TO_KG[normalizedUnit];
  if (!Number.isFinite(value) || value < 0 || !multiplier) return null;
  const base = Math.round(value * multiplier);
  return {
    quantity: Math.round(value * 1000) / 1000,
    unit: normalizedUnit,
    base,
    baseUnit: 'KG',
  };
}

export type ItemTrackingConfigInput = Partial<ItemTrackingConfig> & { tracking_mode?: TrackingMode | null };

export function commercialQuantityUnitsForItem(item: ItemTrackingConfigInput | null | undefined): string[] {
  if (!item) return [...DISPLAY_UNITS];
  switch (item.tracking_mode ?? 'WEIGHT_ONLY') {
    case 'VARIABLE_BAG':
      return ['BAG', ...DISPLAY_UNITS];
    case 'FIXED_PACKAGE':
      return ['BAG', ...DISPLAY_UNITS];
    case 'COUNT_ONLY':
      return ['PIECE'];
    default:
      return [...DISPLAY_UNITS];
  }
}

export function defaultCommercialQuantityUnit(item: ItemTrackingConfigInput | null | undefined): string {
  if (!item) return 'QUINTAL';
  const mode = item.tracking_mode ?? 'WEIGHT_ONLY';
  const rateUnit = String(item.default_rate_unit ?? '').trim().toUpperCase();
  if (rateUnit === 'BAG') return 'BAG';
  if (rateUnit === 'PIECE') return 'PIECE';
  if (mode === 'COUNT_ONLY') return 'PIECE';
  if (mode === 'FIXED_PACKAGE') return 'BAG';
  if (mode === 'VARIABLE_BAG' && rateUnit === 'BAG') return 'BAG';
  return String(item.display_unit ?? 'QUINTAL').trim().toUpperCase();
}

export function commercialRateLabel(unit: string): string {
  const normalized = String(unit).trim().toUpperCase();
  if (normalized === 'BAG') return 'Rate ₹ / bag';
  if (normalized === 'PIECE') return 'Rate ₹ / piece';
  if (normalized === 'KG') return 'Rate ₹ / kg';
  return 'Rate ₹ / qtl';
}

export function commercialQuantityStep(unit: string): { min: string; step: string } {
  const normalized = String(unit).trim().toUpperCase();
  if (normalized === 'BAG' || normalized === 'PIECE') return { min: '1', step: '1' };
  return { min: '0.001', step: '0.001' };
}

export function formatCommercialQuantity(quantity: number | null | undefined, unit: string | null | undefined): string {
  if (quantity == null) return '—';
  const normalized = String(unit ?? 'KG').trim().toUpperCase();
  if (normalized === 'BAG') return `${quantity.toLocaleString('en-IN')} bag${quantity === 1 ? '' : 's'}`;
  if (normalized === 'PIECE') return `${quantity.toLocaleString('en-IN')} piece${quantity === 1 ? '' : 's'}`;
  if (normalized === 'QUINTAL') return `${quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} qtl`;
  if (normalized === 'TONNE') return `${quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })} t`;
  return `${quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`;
}

export function normalizeCommercialQuantityInput(
  item: ItemTrackingConfig,
  quantity: unknown,
  unit: unknown,
): NormalizeQuantityResult | null {
  const normalizedUnit = String(unit ?? 'KG').trim().toUpperCase();
  const value = Number(quantity);
  if (!Number.isFinite(value) || value < 0) return null;

  if (item.tracking_mode === 'VARIABLE_BAG' && normalizedUnit === 'BAG') {
    if (!Number.isInteger(value) || value <= 0) return null;
    return {
      quantity: value,
      unit: 'BAG',
      base: value,
      baseUnit: 'BAG',
      bagCount: value,
    };
  }

  return normalizeItemQuantityInput(item, quantity, unit);
}

export function normalizeItemQuantityInput(
  item: ItemTrackingConfig,
  quantity: unknown,
  unit: unknown,
): NormalizeQuantityResult | null {
  const normalizedUnit = String(unit ?? 'KG').trim().toUpperCase();
  const value = Number(quantity);
  if (!Number.isFinite(value) || value < 0) return null;

  const mode = item.tracking_mode;
  if (rejectVariableBagFixedConversion(mode, normalizedUnit)) return null;

  const direct = normalizeWeightQuantity(quantity, unit);
  if (direct) return direct;

  if (mode === 'FIXED_PACKAGE') {
    const packageUnit = String(item.package_unit ?? '').trim().toUpperCase();
    const kgPerPack = Number(item.package_quantity_base);
    if (!['BAG', 'PIECE'].includes(normalizedUnit) || packageUnit !== normalizedUnit || !(kgPerPack > 0)) return null;
    const base = Math.round(value * kgPerPack);
    return {
      quantity: Math.round(value * 1000) / 1000,
      unit: normalizedUnit,
      base,
      baseUnit: 'KG',
      bagCount: normalizedUnit === 'BAG' ? Math.round(value) : null,
    };
  }

  if (mode === 'COUNT_ONLY' && normalizedUnit === 'PIECE') {
    if (!Number.isInteger(value) || value <= 0) return null;
    return {
      quantity: value,
      unit: 'PIECE',
      base: value,
      baseUnit: 'PIECE',
      bagCount: null,
    };
  }

  return null;
}

export type SaudaCommercialRow = {
  agreed_value_paise?: number | null;
  rate_paise_per_qtl?: number | null;
  agreed_quantity?: number | null;
  agreed_unit?: string | null;
  qty_kg?: number;
};

/** Authoritative total deal value; falls back to legacy per-unit rate when needed. */
export function saudaAgreedValuePaise(sauda: SaudaCommercialRow): number {
  const stored = Number(sauda.agreed_value_paise ?? 0);
  if (stored > 0) return Math.round(stored);

  const unit = String(sauda.agreed_unit ?? 'QUINTAL').trim().toUpperCase();
  const ratePaise = sauda.rate_paise_per_qtl ?? 0;
  if (!ratePaise) return 0;

  return calculateCommercialValue({
    qtyKg: sauda.qty_kg ?? 0,
    bagCount: unit === 'BAG' ? sauda.agreed_quantity : null,
    pieceCount: unit === 'PIECE' ? sauda.agreed_quantity : null,
    rateInr: ratePaise / 100,
    rateUnit: unit === 'QUINTAL' ? 'QTL' : unit,
  });
}

/** Pro-rate a sauda's total value by received weight or count. */
export function proRateSaudaValuePaise(
  sauda: SaudaCommercialRow,
  partialKg: number,
  partialCount?: number | null,
): number {
  const total = saudaAgreedValuePaise(sauda);
  if (total <= 0) return 0;

  const unit = String(sauda.agreed_unit ?? 'QUINTAL').trim().toUpperCase();
  if (unit === 'BAG' || unit === 'PIECE') {
    const totalCount = Number(sauda.agreed_quantity ?? 0);
    const partial = partialCount ?? partialKg;
    if (totalCount <= 0) return 0;
    return Math.round(total * (Math.max(0, partial) / totalCount));
  }

  const totalKg = Number(sauda.qty_kg ?? 0);
  if (totalKg <= 0) return 0;
  return Math.round(total * (Math.max(0, partialKg) / totalKg));
}

export function resolveSaudaCommercialInput(params: {
  valuePaise?: number | null;
  ratePaise?: number | null;
  quantity: number;
  unit: string;
  qtyKg: number;
}): { agreedValuePaise: number; ratePaisePerUnit: number } | null {
  const unit = String(params.unit).trim().toUpperCase();
  const hasValue = params.valuePaise != null && Number.isFinite(params.valuePaise) && params.valuePaise >= 0;
  const hasRate = params.ratePaise != null && Number.isFinite(params.ratePaise) && params.ratePaise >= 0;
  if (!hasValue && !hasRate) return null;

  if (hasValue) {
    const agreedValuePaise = Math.round(params.valuePaise!);
    const ratePaisePerUnit = deriveRatePaiseFromTotalValue({
      totalValuePaise: agreedValuePaise,
      qtyKg: params.qtyKg,
      quantity: params.quantity,
      unit,
    });
    return { agreedValuePaise, ratePaisePerUnit };
  }

  const ratePaisePerUnit = Math.round(params.ratePaise!);
  const agreedValuePaise = calculateCommercialValue({
    qtyKg: params.qtyKg,
    bagCount: unit === 'BAG' ? params.quantity : null,
    pieceCount: unit === 'PIECE' ? params.quantity : null,
    rateInr: ratePaisePerUnit / 100,
    rateUnit: unit === 'QUINTAL' ? 'QTL' : unit,
  });
  return { agreedValuePaise, ratePaisePerUnit };
}
