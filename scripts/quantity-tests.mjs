/**
 * Unit tests for shared quantity module.
 * Run: npm run test:quantity
 */
import assert from 'node:assert/strict';
import {
  allocateProportionalKg,
  calculateCommercialValue,
  deriveRatePaiseFromTotalValue,
  deriveAverageKgPerBag,
  fixedPackageKg,
  formatBagCount,
  formatDualQuantity,
  commercialQuantityUnitsForItem,
  defaultCommercialQuantityUnit,
  formatCommercialQuantity,
  normalizeCommercialQuantityInput,
  normalizeItemQuantityInput,
  proRateSaudaValuePaise,
  rejectVariableBagFixedConversion,
  resolveSaudaCommercialInput,
  saudaAgreedValuePaise,
  validateItemTrackingConfig,
} from '../shared/quantity.ts';

// Average bag weight
{
  assert.equal(deriveAverageKgPerBag(6250, 100), 62.5);
  assert.equal(deriveAverageKgPerBag(6250, null), null);
  assert.equal(deriveAverageKgPerBag(6250, 0), null);
}

// Variable bags reject fixed conversion
{
  assert.equal(rejectVariableBagFixedConversion('VARIABLE_BAG', 'BAG'), true);
  assert.equal(
    normalizeItemQuantityInput(
      { tracking_mode: 'VARIABLE_BAG', display_unit: 'QUINTAL' },
      100,
      'BAG',
    ),
    null,
  );
  assert.equal(
    normalizeItemQuantityInput(
      { tracking_mode: 'VARIABLE_BAG', display_unit: 'QUINTAL' },
      62.5,
      'QUINTAL',
    )?.base,
    6250,
  );
}

// Fixed package conversion
{
  assert.equal(fixedPackageKg(100, 25), 2500);
  assert.equal(
    normalizeItemQuantityInput(
      { tracking_mode: 'FIXED_PACKAGE', package_unit: 'BAG', package_quantity_base: 25 },
      100,
      'BAG',
    )?.base,
    2500,
  );
}

// Proportional settlement allocations sum exactly
{
  const totalKg = 6250;
  const lineBags = [10, 30, 60];
  const allocated = allocateProportionalKg(totalKg, lineBags, 100);
  assert.deepEqual(allocated, [625, 1875, 3750]);
  assert.equal(allocated.reduce((sum, kg) => sum + kg, 0), totalKg);
}

// Rounding case still reconciles
{
  const totalKg = 1000;
  const lineBags = [1, 1, 1];
  const allocated = allocateProportionalKg(totalKg, lineBags, 3);
  assert.equal(allocated.reduce((sum, kg) => sum + kg, 0), totalKg);
  assert.equal(allocated[2], totalKg - allocated[0] - allocated[1]);
}

// Missing bag count stays unknown
{
  assert.equal(formatBagCount(null), null);
  assert.equal(formatBagCount(undefined), null);
  const label = formatDualQuantity({ weightKg: 6250, bagCount: null, trackingMode: 'VARIABLE_BAG' });
  assert.match(label, /qtl/);
  assert.doesNotMatch(label, /bag/i);
}

// Item validation
{
  assert.equal(
    validateItemTrackingConfig({
      tracking_mode: 'VARIABLE_BAG',
      display_unit: 'QUINTAL',
      package_quantity_base: 60,
      package_unit: 'BAG',
    }),
    'variable-bag items must not have a fixed package weight',
  );
  assert.equal(
    validateItemTrackingConfig({
      tracking_mode: 'FIXED_PACKAGE',
      package_unit: 'BAG',
      package_quantity_base: 25,
    }),
    null,
  );
  assert.equal(
    validateItemTrackingConfig({
      tracking_mode: 'COUNT_ONLY',
      package_unit: 'PIECE',
      package_quantity_base: 1,
    }),
    null,
  );
}

// Commercial value
{
  assert.equal(calculateCommercialValue({ qtyKg: 6250, bagCount: 30, rateInr: 250, rateUnit: 'BAG' }), 750000);
  assert.equal(calculateCommercialValue({ qtyKg: 1875, rateInr: 200, rateUnit: 'QTL' }), 375000);
  assert.equal(
    deriveRatePaiseFromTotalValue({ totalValuePaise: 750000, qtyKg: 0, quantity: 30, unit: 'BAG' }),
    25000,
  );
  assert.equal(
    deriveRatePaiseFromTotalValue({ totalValuePaise: 375000, qtyKg: 1875, quantity: 18.75, unit: 'QUINTAL' }),
    20000,
  );
}

// Sauda agreed value
{
  const bagSauda = {
    agreed_value_paise: 750000,
    agreed_quantity: 30,
    agreed_unit: 'BAG',
    qty_kg: 0,
    rate_paise_per_qtl: 25000,
  };
  assert.equal(saudaAgreedValuePaise(bagSauda), 750000);
  assert.equal(proRateSaudaValuePaise(bagSauda, 0, 10), 250000);
  const resolved = resolveSaudaCommercialInput({
    valuePaise: 375000,
    quantity: 18.75,
    unit: 'QUINTAL',
    qtyKg: 1875,
  });
  assert.equal(resolved?.agreedValuePaise, 375000);
  assert.equal(resolved?.ratePaisePerUnit, 20000);
}

// Commercial quantity units and normalization
{
  assert.deepEqual(
    commercialQuantityUnitsForItem({ tracking_mode: 'VARIABLE_BAG', display_unit: 'QUINTAL' }),
    ['BAG', 'KG', 'QUINTAL', 'TONNE'],
  );
  assert.deepEqual(
    commercialQuantityUnitsForItem({ tracking_mode: 'COUNT_ONLY', package_unit: 'PIECE', package_quantity_base: 1 }),
    ['PIECE'],
  );
  assert.equal(
    defaultCommercialQuantityUnit({ tracking_mode: 'FIXED_PACKAGE', default_rate_unit: 'BAG' }),
    'BAG',
  );
  assert.equal(
    normalizeCommercialQuantityInput(
      { tracking_mode: 'VARIABLE_BAG', display_unit: 'QUINTAL' },
      100,
      'BAG',
    )?.baseUnit,
    'BAG',
  );
  assert.equal(formatCommercialQuantity(100, 'BAG'), '100 bags');
  assert.equal(formatCommercialQuantity(12, 'PIECE'), '12 pieces');
}

console.log('quantity-tests: all passed');
