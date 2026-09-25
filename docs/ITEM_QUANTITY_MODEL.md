# Item quantity and packaging model

Status: implemented. This document records the quantity rules that Items, Gate, Sauda, Stock,
Processing, and Dispatch share. Schema naming notes:

- Item policy: `items.tracking_mode` (`WEIGHT_ONLY`, `VARIABLE_BAG`, `FIXED_PACKAGE`, `COUNT_ONLY`)
- Gate observed bags: `gate_entries.observed_bag_count` (nullable — unknown is not zero)
- Lot remaining bags: `lots.bag_count` with `lots.received_bag_count` / `lots.consumed_bag_count`
- Weight provenance: `lots.weight_source` and `gate_intake_lines.weight_source`
- Fixed package weight remains `items.package_quantity_base` for `FIXED_PACKAGE` only

## Core principle

For variable-weight bags, kilograms are authoritative and bags are a second, independently
recorded quantity.

```text
Weight / Bags = Average bag weight
```

Never calculate received stock using:

```text
Bags * Item's assumed bag weight = Stock weight
```

An item's configured bag weight must not replace a weighbridge measurement. For example, if a
truck contains 100 bags and its measured net weight is 6,250 kg, stock receives exactly 6,250 kg
and 100 bags. The receipt average is 62.5 kg/bag. It is not rounded or replaced with an item-level
assumption such as 60 kg/bag.

## Quantities have different meanings

| Concept | Meaning | Example |
|---|---|---|
| Base quantity | Authoritative physical inventory quantity | 6,250 kg |
| Display quantity | Presentation of the base quantity | 62.50 qtl |
| Secondary count | Count observed in the operation | 100 bags |
| Average bag weight | Receipt- or lot-specific derived value | 62.5 kg/bag |
| Rate unit | Unit used to calculate commercial value | INR/bag or INR/qtl |

The average bag weight is derived from the same operational record. It is not an Item conversion
factor. A different truck carrying the same Item may have a different average.

## Item tracking modes

The Item defines which quantities an operation should request. It does not invent operational
measurements.

### Weight only

Use for loose or bulk material where bag count is not meaningful.

- Base unit: KG
- Preferred display unit: KG, QUINTAL, or TONNE
- Bag count: not requested
- Example: loose husk or bulk bran

### Weight and variable bags

Use when material is received, stored, or traded in bags whose filled weights vary.

- Base unit: KG
- Preferred display unit: usually QUINTAL
- Bag count: recorded when known
- Average kg/bag: calculated per receipt or lot
- No fixed kg/bag conversion
- Example: paddy received in bags averaging roughly 60-65 kg

### Count only

Use when weight is not the inventory truth.

- Base unit: PIECE or another future count unit
- Weight: optional descriptive information only
- Example: machine parts or tools

### Fixed package

This is different from variable bags and should be a separate mode when needed.

- A declared pack size may convert count to weight
- The conversion is valid only because the product is intentionally packed to that specification
- Example: finished rice packed as sealed 25 kg bags

Do not use Fixed package for agricultural bags merely because their weights tend to fall within
a familiar range.

## Gate intake

For a Weight and variable bags Item, an incoming Gate receipt records:

```text
Gross vehicle weight
- Tare vehicle weight
= Net received weight in kg

Net received weight / observed bag count
= Receipt average kg/bag
```

Required facts:

- measured net weight in whole kilograms;
- observed whole bag count;
- weight source, normally `WEIGHED`;
- Item and receipt/lot identity.

The calculated average is useful for operator review and later proportional allocation, but the
net weight remains authoritative.

## Stock lots must preserve two quantities

A variable-bag lot may carry both:

```text
remaining_weight_kg
remaining_bag_count
```

The UI may display:

```text
62.50 qtl | 100 bags | avg 62.5 kg/bag
```

Bag count is nullable. `NULL` means it was not recorded; it must not be displayed as zero.

Empty gunny bags are separate packaging inventory. The secondary bag count on a paddy lot means
"bags containing this paddy", not ownership or balance of empty gunny bags.

## Accept and settlement

Full acceptance posts the exact remaining Gate weight and the exact remaining bag count to the
new lot. It must not convert bags through an Item-level weight.

When one weighed truck is split into settlement lines but the lines are not separately weighed,
allocate weight proportionally using that truck's average:

```text
line_weight_kg = truck_net_weight_kg * line_bags / truck_total_bags
```

The final line absorbs integer-kilogram rounding so all line weights sum exactly to the measured
truck weight. Mark these line weights as `DERIVED`. If a line was separately weighed, use that
actual measurement and mark it `WEIGHED`.

Example:

| Outcome | Bags | Rate | Allocated weight |
|---|---:|---:|---:|
| Rejected | 10 | - | 625 kg |
| Accepted | 30 | INR 250/bag | 1,875 kg |
| Accepted | 60 | INR 200/bag | 3,750 kg |
| Total | 100 | | 6,250 kg |

## Processing input policy

Processing remains weight-authoritative. For a Weight and variable bags lot, the safest default is
to consume the whole remaining lot because that preserves the exact Gate weight without inventing
the weight of a subset of bags.

### Whole variable-bag lot (default path)

Selecting a variable-bag lot for processing copies its complete remaining kilograms and complete
remaining bag count. The quantity is read-only in the processing form.

```text
LOT-101 available ........ 6,250 kg | 100 bags
Processing input ......... 6,250 kg | 100 bags
```

This is exact because the complete measured lot is consumed.

### Partial variable-bag lot (only through a weighed split)

If the mill physically processes only part of a variable-bag lot, do not let the operator type an
arbitrary partial quantity in the processing form. First split the source lot using an actual
measured weight and, when known, the selected bag count.

```text
Parent lot ............... 6,250 kg | 100 bags
Weighed child lot ........ 1,900 kg | 30 bags
Parent remainder ......... 4,350 kg | 70 bags
Processing input ......... full child lot: 1,900 kg | 30 bags
```

The child lot must identify the parent lot and mark its weight `WEIGHED`. Processing then consumes
the whole child lot. This keeps exact traceability without pretending that mills never run partial
batches.

Do not derive a partial processing weight merely by multiplying selected bags by the parent lot
average when the product promise is perfect weight tracking. Such a number may be useful as an
operator preview, but it is not exact and must not be posted as a weighed consumption.

Weight-only lots may still allow partial processing when the input kilograms are actually measured.
Fixed-package lots may allow partial processing by whole package count because their conversion is
deliberately fixed. Count-only lots may allow partial processing by count.

## Processing output

Output quantities follow the output Item's tracking mode, not the input Item's mode.

If raw material arrives in variable bags but processing output is measured only by weight:

- record and show output kilograms/quintals;
- do not calculate output bags from input bags;
- do not manufacture a bag count from an average pack size;
- leave output bag count absent, not zero.

If the output is physically bagged and counted immediately, record both actual output weight and
actual output bag count. If bagging happens later, milling should create a Weight-only bulk output
lot and a later Packaging/Bagging operation should create the packed lot.

Examples:

```text
Paddy input item ........ Weight and variable bags
Milling input ........... 6,250 kg | 100 bags
Rice output item ........ Weight only
Milling output .......... 4,180 kg
```

Or, when packaging is performed:

```text
Bulk rice lot ........... 4,180 kg
        |
        | Packaging/Bagging
        v
Packed rice lot ......... 4,150 kg | 166 x 25 kg bags
Packaging variance ...... 30 kg, explained or reconciled
```

The normal UI should always show authoritative weight. Show bags alongside weight only when a bag
count was actually recorded and the Item supports bag tracking.

## Commercial quantities and rates

Quantity and rate units are commercial facts and must remain explicit.

- INR/qtl value uses actual or allocated kilograms.
- INR/bag value uses the recorded bag count.
- Do not overwrite the original rate unit with a converted rate.
- A derived effective INR/qtl or INR/bag may be displayed for comparison, but it is not the
  contractual rate.

A bag-based Sauda should be fulfilled by actual delivered bags. A weight-based Sauda should be
fulfilled by actual delivered kilograms. Actual deliveries should retain both when both are known.

## Weight provenance

Every operational weight that could be mistaken for a scale reading should identify its source:

| Source | Meaning |
|---|---|
| `WEIGHED` | Measured by a scale for this operation |
| `DERIVED` | Proportionally calculated from a measured parent receipt or lot |
| `MANUAL` | Entered by an operator without linked scale evidence |

This prevents calculated figures from looking more precise than they are.

## Item screen rules

The Item form should ask:

1. Item name, category, and HSN.
2. Tracking mode: Weight only, Weight and variable bags, Count only, or later Fixed package.
3. Preferred weight display: KG, QUINTAL, or TONNE when applicable.
4. Whether bag count is required at Gate for a variable-bag Item.
5. Default commercial quantity and rate units.
6. Processing fields such as typical OTR only where relevant.

The Item form must not ask for an assumed kg/bag when the tracking mode is Weight and variable bags.

## Invariants

1. Measured kilograms are never replaced by a package conversion.
2. Variable bag weight belongs to a receipt or lot, not the Item.
3. Average kg/bag is always `weight / bags` from the same context.
4. A missing bag count is unknown, not zero.
5. Stock postings from Gate sum exactly to Gate net weight.
6. Settlement line weights sum exactly to their parent receipt weight.
7. Processing input kilograms cannot exceed the lot's remaining kilograms.
8. Processing input bags cannot exceed the lot's remaining bags when bags are tracked.
9. A variable-bag lot is consumed in full by default so its exact measured weight is preserved.
10. Partial variable-bag processing requires an exact weighed child-lot split first.
11. Weight-only partial processing requires an actual measured input weight.
12. Processing output uses its own Item tracking mode.
13. Output bags are shown only when they were actually counted or created by packaging.
14. Commercial rate units are retained as entered.
15. Every derived or manual weight is distinguishable from a weighed value.

## Implementation direction

The quantity rules should sit behind one deep quantity module rather than being reimplemented in
Gate, Stock, Settlement, Sauda, Processing, and Dispatch. Its small interface should cover:

- validating a pair of weight and secondary count;
- deriving an average;
- proportionally allocating a measured weight across count lines with exact-total rounding;
- consuming a partial lot by weighed kilograms or derived bags;
- formatting dual quantities for display;
- calculating value using the explicitly selected rate unit.

Keeping these rules behind one interface gives every workflow the same arithmetic, rounding, and
validation behavior.
