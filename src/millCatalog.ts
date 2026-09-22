// Signup mill catalogs: process types, default chain, and starter items.
// Rice remains the existing mill; other types reuse the same ERP surfaces.

export const SIGNUP_MILL_TYPES = ['RICE', 'FLOUR', 'PULSES', 'SPICES', 'SUGAR', 'OIL'] as const;
export type SignupMillType = (typeof SIGNUP_MILL_TYPES)[number];

// Later mill types (commented out until catalogs are ready):
// Seeds, Millets, Nuts, Flakes
// export const LATER_MILL_TYPES = ['SEEDS', 'MILLETS', 'NUTS', 'FLAKES'] as const;

export function normalizeMillType(value: unknown): SignupMillType | null {
  const millType = String(value ?? 'RICE').trim().toUpperCase();
  return (SIGNUP_MILL_TYPES as readonly string[]).includes(millType) ? millType as SignupMillType : null;
}

export type CatalogItem = {
  name: string;
  category: 'paddy' | 'rice' | 'byproduct';
  categoryCode: 'RAW_MATERIAL' | 'FINISHED_GOOD' | 'BYPRODUCT';
  hsn: string;
  typicalOtrPct: number | null;
};

export type MillCatalog = {
  processes: [string, string][];
  chain: { name: string; description: string; inputCategory: string; expectedYieldPct: number };
  items: CatalogItem[];
};

const RICE: MillCatalog = {
  processes: [
    ['Pre-Cleaning', 'Remove dust, stones and foreign matter before milling.'],
    ['De-husking (Hulling)', 'Separate husk from paddy.'],
    ['Paddy Separation', 'Separate paddy and brown rice.'],
    ['Whitening and Polishing', 'Whiten and polish brown rice to finished rice.'],
    ['Grading and Color Sorting', 'Grade kernels and remove discolored grains.'],
    ['Weighing and Packaging', 'Weigh, pack and prepare finished goods for dispatch.'],
  ],
  chain: {
    name: 'Rice Milling Pipeline',
    description: 'Default end-to-end rice milling chain: Pre-Cleaning through Packaging.',
    inputCategory: 'paddy',
    expectedYieldPct: 67,
  },
  items: [
    { name: 'Paddy (common)', category: 'paddy', categoryCode: 'RAW_MATERIAL', hsn: '1006', typicalOtrPct: null },
    { name: 'Raw Rice', category: 'rice', categoryCode: 'FINISHED_GOOD', hsn: '1006', typicalOtrPct: 67 },
    { name: 'Parboiled Non-Basmati Rice', category: 'rice', categoryCode: 'FINISHED_GOOD', hsn: '1006', typicalOtrPct: 68 },
    { name: 'Rice Bran', category: 'byproduct', categoryCode: 'BYPRODUCT', hsn: '2302', typicalOtrPct: 8 },
    { name: 'Broken Rice', category: 'byproduct', categoryCode: 'BYPRODUCT', hsn: '1006', typicalOtrPct: 5 },
    { name: 'Husk', category: 'byproduct', categoryCode: 'BYPRODUCT', hsn: '1213', typicalOtrPct: 20 },
  ],
};

const FLOUR: MillCatalog = {
  processes: [
    ['Cleaning and Destoning', 'Remove dust, stones and foreign matter from grain.'],
    ['Conditioning / Tempering', 'Moisten grain so bran separates cleanly during milling.'],
    ['Milling / Grinding', 'Grind grain into flour streams.'],
    ['Sifting and Grading', 'Separate atta, maida, suji and bran.'],
    ['Weighing and Packaging', 'Weigh, pack and prepare finished flour for dispatch.'],
  ],
  chain: {
    name: 'Flour Milling Pipeline',
    description: 'Default flour mill chain: Cleaning through Packaging.',
    inputCategory: 'wheat',
    expectedYieldPct: 75,
  },
  items: [
    { name: 'Wheat', category: 'paddy', categoryCode: 'RAW_MATERIAL', hsn: '1001', typicalOtrPct: null },
    { name: 'Atta', category: 'rice', categoryCode: 'FINISHED_GOOD', hsn: '1101', typicalOtrPct: 75 },
    { name: 'Maida', category: 'rice', categoryCode: 'FINISHED_GOOD', hsn: '1101', typicalOtrPct: 70 },
    { name: 'Suji / Rava', category: 'rice', categoryCode: 'FINISHED_GOOD', hsn: '1103', typicalOtrPct: 8 },
    { name: 'Wheat Bran', category: 'byproduct', categoryCode: 'BYPRODUCT', hsn: '2302', typicalOtrPct: 18 },
  ],
};

const PULSES: MillCatalog = {
  processes: [
    ['Cleaning', 'Remove dust, stones and foreign matter from whole pulses.'],
    ['Dehusking', 'Remove the outer husk from dal.'],
    ['Splitting', 'Split whole pulses into dal.'],
    ['Polishing and Grading', 'Polish and grade finished dal.'],
    ['Weighing and Packaging', 'Weigh, pack and prepare dal for dispatch.'],
  ],
  chain: {
    name: 'Dal Milling Pipeline',
    description: 'Default pulses/dal mill chain: Cleaning through Packaging.',
    inputCategory: 'pulses',
    expectedYieldPct: 75,
  },
  items: [
    { name: 'Whole Pulses', category: 'paddy', categoryCode: 'RAW_MATERIAL', hsn: '0713', typicalOtrPct: null },
    { name: 'Split Dal', category: 'rice', categoryCode: 'FINISHED_GOOD', hsn: '0713', typicalOtrPct: 75 },
    { name: 'Broken Dal', category: 'byproduct', categoryCode: 'BYPRODUCT', hsn: '0713', typicalOtrPct: 8 },
    { name: 'Chuni / Husk', category: 'byproduct', categoryCode: 'BYPRODUCT', hsn: '2302', typicalOtrPct: 15 },
  ],
};

const SPICES: MillCatalog = {
  processes: [
    ['Cleaning and Sorting', 'Remove stems, dust and foreign matter from whole spices.'],
    ['Drying', 'Dry spices to a stable moisture before grinding.'],
    ['Grinding', 'Grind whole spices into powder.'],
    ['Sieving', 'Sieve powder to a consistent mesh.'],
    ['Weighing and Packaging', 'Weigh, pack and prepare spice powder for dispatch.'],
  ],
  chain: {
    name: 'Spice Milling Pipeline',
    description: 'Default spice mill chain: Cleaning through Packaging.',
    inputCategory: 'spices',
    expectedYieldPct: 92,
  },
  items: [
    { name: 'Whole Spices', category: 'paddy', categoryCode: 'RAW_MATERIAL', hsn: '0904', typicalOtrPct: null },
    { name: 'Ground Spice Powder', category: 'rice', categoryCode: 'FINISHED_GOOD', hsn: '0904', typicalOtrPct: 92 },
    { name: 'Stems / Waste', category: 'byproduct', categoryCode: 'BYPRODUCT', hsn: '0904', typicalOtrPct: 6 },
  ],
};

const SUGAR: MillCatalog = {
  processes: [
    ['Crushing / Extraction', 'Extract juice from cane or dissolve raw sugar.'],
    ['Clarification', 'Clarify juice or liquor before crystallization.'],
    ['Crystallization', 'Grow sugar crystals from concentrated liquor.'],
    ['Centrifuging', 'Separate crystals from molasses.'],
    ['Drying and Packaging', 'Dry, weigh and pack finished sugar.'],
  ],
  chain: {
    name: 'Sugar Milling Pipeline',
    description: 'Default sugar mill chain: Extraction through Packaging.',
    inputCategory: 'cane',
    expectedYieldPct: 10,
  },
  items: [
    { name: 'Sugarcane / Raw Sugar', category: 'paddy', categoryCode: 'RAW_MATERIAL', hsn: '1701', typicalOtrPct: null },
    { name: 'White Sugar', category: 'rice', categoryCode: 'FINISHED_GOOD', hsn: '1701', typicalOtrPct: 10 },
    { name: 'Molasses', category: 'byproduct', categoryCode: 'BYPRODUCT', hsn: '1703', typicalOtrPct: 4 },
    { name: 'Bagasse', category: 'byproduct', categoryCode: 'BYPRODUCT', hsn: '2303', typicalOtrPct: 30 },
  ],
};

const OIL: MillCatalog = {
  processes: [
    ['Cleaning', 'Clean oilseeds before crushing.'],
    ['Crushing / Expelling', 'Press oil from seed.'],
    ['Filtering', 'Filter crude oil to finished oil.'],
    ['Weighing and Packaging', 'Weigh, pack and prepare oil for dispatch.'],
  ],
  chain: {
    name: 'Oil Milling Pipeline',
    description: 'Default oil mill chain: Cleaning through Packaging.',
    inputCategory: 'oilseed',
    expectedYieldPct: 35,
  },
  items: [
    { name: 'Oilseeds', category: 'paddy', categoryCode: 'RAW_MATERIAL', hsn: '1207', typicalOtrPct: null },
    { name: 'Filtered Oil', category: 'rice', categoryCode: 'FINISHED_GOOD', hsn: '1512', typicalOtrPct: 35 },
    { name: 'Oil Cake', category: 'byproduct', categoryCode: 'BYPRODUCT', hsn: '2306', typicalOtrPct: 55 },
    { name: 'Sediment', category: 'byproduct', categoryCode: 'BYPRODUCT', hsn: '1512', typicalOtrPct: 3 },
  ],
};

const CATALOGS: Record<SignupMillType, MillCatalog> = {
  RICE, FLOUR, PULSES, SPICES, SUGAR, OIL,
};

export function millCatalog(millType: SignupMillType): MillCatalog {
  return CATALOGS[millType] || RICE;
}

export function defaultGodownCapacity(unit: string): number {
  if (unit === 'KG') return 200_000;
  if (unit === 'TONNE') return 200;
  return 2000;
}
