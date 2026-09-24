import type { CatalogProcessType } from '../components/process-catalog';
import type { ProcessingChainRecord, ProcessingChainStep } from './process-studio';
import type { AvailableLot } from './chain-run';

export type ClassicYieldLine = {
  kind: 'main' | 'byproduct' | 'loss';
  name: string;
  pct: number;
  minPct?: number;
  maxPct?: number;
  itemId?: string | null;
};

export type ClassicStepProfile = {
  detail: string;
  mainProduct: string;
  lines: ClassicYieldLine[];
};

export type ClassicForecastStep = {
  id: string;
  step: ProcessingChainStep;
  index: number;
  profile: ClassicStepProfile;
  inputQty: number;
  mainQty: number;
  byproductQtys: { name: string; qty: number; pct: number }[];
  lossQty: number;
  changed: boolean;
};

export type ClassifiedMaterials = {
  eligible: AvailableLot[];
  for_reuse: AvailableLot[];
  ineligible: { lot: AvailableLot; reason: string }[];
  permissive: boolean;
};

const CLASSIC_UNITS = ['Bags', 'KG', 'QUINTAL', 'TONNE'];

export function classicUnits(preferred?: string | null) {
  const unit = String(preferred ?? 'QUINTAL').toUpperCase();
  const label = unit === 'KG' ? 'KG' : unit === 'TONNE' ? 'Tonne' : unit === 'QUINTAL' ? 'Quintal' : unit;
  return CLASSIC_UNITS.includes(label) ? CLASSIC_UNITS : [label, ...CLASSIC_UNITS];
}

export function roundClassicQty(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function allowedInputItemIds(type?: CatalogProcessType | null) {
  const ids = (type?.template_lines ?? [])
    .filter((line) => line.line_type === 'INPUT' && line.item_id)
    .map((line) => line.item_id);
  return new Set(ids);
}

export function classifyLotsForProcess(type: CatalogProcessType | undefined, lots: AvailableLot[]): ClassifiedMaterials {
  const allowed = allowedInputItemIds(type);
  const permissive = allowed.size === 0;
  const eligible: AvailableLot[] = [];
  const forReuse: AvailableLot[] = [];
  const ineligible: { lot: AvailableLot; reason: string }[] = [];

  for (const lot of lots) {
    const isAllowed = permissive || allowed.has(lot.item_id);
    if (!isAllowed) {
      ineligible.push({ lot, reason: 'This item is not accepted by this process' });
      continue;
    }
    if (lot.disposition === 'FOR_REUSE' || lot.for_reuse) forReuse.push(lot);
    else eligible.push(lot);
  }

  return { eligible, for_reuse: forReuse, ineligible, permissive };
}

export function lotMatchesProcessInput(type: CatalogProcessType | undefined, lot: AvailableLot) {
  const allowed = allowedInputItemIds(type);
  return allowed.size === 0 || allowed.has(lot.item_id);
}

/** Legacy rice-mill yield defaults keyed by process name. */
function profileFromProcessName(name: string): ClassicStepProfile {
  const key = String(name || '').toLowerCase();
  if (key.includes('pre-clean')) {
    return profileFromParts('Removes dust, stones and foreign matter.', 'Clean paddy', [
      { kind: 'main', name: 'Clean paddy', pct: 98, minPct: 96, maxPct: 99 },
      { kind: 'loss', name: 'Impurities', pct: 2, minPct: 1, maxPct: 4 },
    ]);
  }
  if (key.includes('de-husk') || key.includes('hulling')) {
    return profileFromParts('Separates husk from paddy to produce brown rice.', 'Brown rice', [
      { kind: 'main', name: 'Brown rice', pct: 78, minPct: 75, maxPct: 80 },
      { kind: 'byproduct', name: 'Husk', pct: 20, minPct: 18, maxPct: 22 },
      { kind: 'loss', name: 'Milling loss', pct: 2, minPct: 1, maxPct: 3 },
    ]);
  }
  if (key.includes('separation')) {
    return profileFromParts('Separates remaining paddy from brown rice.', 'Separated brown rice', [
      { kind: 'main', name: 'Separated brown rice', pct: 97, minPct: 95, maxPct: 98 },
      { kind: 'byproduct', name: 'Return paddy', pct: 2, minPct: 1, maxPct: 3 },
      { kind: 'loss', name: 'Separation loss', pct: 1, minPct: 0.5, maxPct: 2 },
    ]);
  }
  if (key.includes('whiten') || key.includes('polish')) {
    return profileFromParts('Whitening and polishing produces finished white rice.', 'White rice', [
      { kind: 'main', name: 'White rice', pct: 89, minPct: 86, maxPct: 92 },
      { kind: 'byproduct', name: 'Rice bran', pct: 8, minPct: 6, maxPct: 10 },
      { kind: 'loss', name: 'Expected loss', pct: 3, minPct: 2, maxPct: 4 },
    ]);
  }
  if (key.includes('grad') || key.includes('color')) {
    return profileFromParts('Grades rice and removes broken or discoloured grain.', 'Graded rice', [
      { kind: 'main', name: 'Graded rice', pct: 96, minPct: 94, maxPct: 98 },
      { kind: 'byproduct', name: 'Broken rice', pct: 3, minPct: 2, maxPct: 5 },
      { kind: 'loss', name: 'Expected loss', pct: 1, minPct: 0.5, maxPct: 2 },
    ]);
  }
  if (key.includes('pack') || key.includes('weigh')) {
    return profileFromParts('Weighs and packs the finished rice.', 'Packed rice', [
      { kind: 'main', name: 'Packed rice', pct: 100, minPct: 99, maxPct: 100 },
    ]);
  }
  return profileFromParts('Editable process yield profile.', 'Main output', [
    { kind: 'main', name: 'Main output', pct: 95, minPct: 90, maxPct: 98 },
    { kind: 'loss', name: 'Expected loss', pct: 5, minPct: 2, maxPct: 10 },
  ]);
}

function profileFromParts(detail: string, mainProduct: string, lines: ClassicYieldLine[]): ClassicStepProfile {
  const total = lines.reduce((sum, line) => sum + line.pct, 0);
  if (total !== 100 && lines.length) {
    const lossIndex = lines.findIndex((line) => line.kind === 'loss');
    const delta = 100 - total;
    if (lossIndex >= 0) lines[lossIndex] = { ...lines[lossIndex], pct: Math.max(0, lines[lossIndex].pct + delta) };
    else lines.push({ kind: 'loss', name: 'Expected loss', pct: Math.max(0, delta) });
  }
  return { detail, mainProduct, lines };
}

export function buildStepProfile(type: CatalogProcessType | undefined, stepName?: string): ClassicStepProfile {
  const base = profileFromProcessName(type?.name ?? stepName ?? '');
  const templateLines = type?.template_lines ?? [];
  if (!templateLines.length) return base;

  const mainLine = templateLines.find((line) => line.line_type === 'OUTPUT' && line.semantic_type === 'main');
  const byproductLines = templateLines.filter((line) => line.line_type === 'OUTPUT' && line.semantic_type === 'byproduct');
  const lossLines = templateLines.filter((line) => line.line_type === 'LOSS' || line.semantic_type === 'waste');

  const lines: ClassicYieldLine[] = [];
  const mainPct = base.lines.find((line) => line.kind === 'main')?.pct ?? 95;
  const byproductBase = base.lines.filter((line) => line.kind === 'byproduct');
  const lossPct = base.lines.find((line) => line.kind === 'loss')?.pct ?? Math.max(0, 100 - mainPct - byproductBase.reduce((sum, line) => sum + line.pct, 0));
  const mainBase = base.lines.find((line) => line.kind === 'main');

  lines.push({
    kind: 'main',
    name: mainLine?.item_name ?? base.mainProduct,
    pct: mainPct,
    minPct: mainBase?.minPct,
    maxPct: mainBase?.maxPct,
    itemId: mainLine?.item_id ?? null,
  });

  if (byproductLines.length) {
    byproductLines.forEach((line, index) => {
      const fallback = byproductBase[index] ?? byproductBase[0];
      const share = byproductBase.length ? (fallback?.pct ?? 0) : 0;
      lines.push({
        kind: 'byproduct',
        name: line.item_name ?? fallback?.name ?? 'By-product',
        pct: share || Math.round((100 - mainPct - lossPct) / byproductLines.length),
        minPct: fallback?.minPct,
        maxPct: fallback?.maxPct,
        itemId: line.item_id ?? null,
      });
    });
  } else {
    byproductBase.forEach((line) => lines.push(line));
  }

  if (lossLines.length) {
    const lossLine = base.lines.find((line) => line.kind === 'loss');
    lines.push({
      kind: 'loss',
      name: lossLines[0].item_name ?? 'Expected loss',
      pct: lossPct,
      minPct: lossLine?.minPct,
      maxPct: lossLine?.maxPct,
      itemId: lossLines[0].item_id ?? null,
    });
  } else if (lossPct > 0) {
    const lossLine = base.lines.find((line) => line.kind === 'loss');
    if (lossLine) lines.push(lossLine);
  }

  const total = lines.reduce((sum, line) => sum + line.pct, 0);
  if (total !== 100) {
    return profileFromParts(type?.description?.trim() || base.detail, lines[0]?.name ?? base.mainProduct, lines);
  }

  return {
    detail: type?.description?.trim() || base.detail,
    mainProduct: lines[0]?.name ?? base.mainProduct,
    lines,
  };
}

export function computeClassicForecast(
  steps: ProcessingChainStep[],
  types: CatalogProcessType[],
  rootQty: number,
  overrides: Record<string, number>,
): ClassicForecastStep[] {
  let inputQty = roundClassicQty(rootQty) || 0;

  return steps
    .slice()
    .sort((left, right) => left.step_number - right.step_number)
    .map((step, index) => {
      const type = types.find((candidate) => candidate.id === step.process_type_id);
      const profile = buildStepProfile(type, step.process_type_name);
      const id = String(step.id);
      const mainPct = profile.lines.find((line) => line.kind === 'main')?.pct ?? 100;
      const mainQty = Object.prototype.hasOwnProperty.call(overrides, id)
        ? roundClassicQty(overrides[id])
        : roundClassicQty(inputQty * mainPct / 100);

      const byproductQtys = profile.lines
        .filter((line) => line.kind === 'byproduct')
        .map((line) => ({
          name: line.name,
          pct: line.pct,
          qty: roundClassicQty(inputQty * line.pct / 100),
        }));

      const lossLine = profile.lines.find((line) => line.kind === 'loss');
      const lossQty = lossLine ? roundClassicQty(inputQty * lossLine.pct / 100) : roundClassicQty(inputQty - mainQty - byproductQtys.reduce((sum, line) => sum + line.qty, 0));

      const result: ClassicForecastStep = {
        id,
        step,
        index,
        profile,
        inputQty,
        mainQty,
        byproductQtys,
        lossQty: Math.max(0, lossQty),
        changed: Object.prototype.hasOwnProperty.call(overrides, id),
      };

      inputQty = mainQty;
      return result;
    });
}

export function chainInputLabel(chain: ProcessingChainRecord) {
  const category = String(chain.input_category ?? '').trim();
  if (category) {
    const label = category.charAt(0).toUpperCase() + category.slice(1);
    return label;
  }
  return 'Input';
}

export function profileSummaryLines(profile: ClassicStepProfile) {
  return profile.lines.map((line) => {
    if (line.kind === 'main') return `Main output: ${line.name} ${line.pct}%`;
    if (line.kind === 'byproduct') return `By-product: ${line.name} ${line.pct}%`;
    return `Expected loss: ${line.name} ${line.pct}%`;
  });
}
