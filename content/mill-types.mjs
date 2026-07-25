// Mill-type (industry) pages.
//
// HONESTY CONSTRAINT — read before editing:
// Only rice is fully built. `production_runs` has literal paddy_in_kg /
// rice_out_kg / bran_out_kg / husk_out_kg columns and `items.category` is
// CHECK-constrained to ('paddy','rice','byproduct'), so the mass-balance and
// item layer is rice-shaped today. Everything else — gate & weighbridge,
// inventory by lot and godown, suppliers/buyers khata, saudas, payments,
// role-locked entry, night digest — is genuinely generic.
//
// So these pages promise exactly that and no more: use it today for everything
// except the mass balance, and tell us your mill type so we can add it. Do not
// let anyone rewrite these into "full support for X" until the schema is
// generalised.

export const millTypes = [
  {
    slug: 'flour-mill-software',
    name: 'Flour mill',
    h1: 'Free flour mill software',
    title: 'Free Flour Mill Software — Gate, Stock & Khata',
    description:
      'Free software for Indian flour mills and roller flour mills: gate and weighbridge capture, live stock by lot and godown, supplier and buyer khata, and the owner\'s night digest. No cost, no card.',
    input: 'wheat',
    outputs: 'atta, maida, suji, rava and chokar',
    reality: `A roller flour mill has the same shape as a rice mill: grain arrives by truck, gets weighed, gets stored by lot, gets processed into a main product plus several by-products, and leaves again. The by-product side is arguably more commercially important than in rice — chokar has a real market, and maida, suji and rava each carry their own rate, so a run that drifts in its product split changes what the day was worth.`,
    leak: `Wheat bought on weight and moisture, several products out at different rates, and a bran stream that is easy to sell casually. If the split between atta, maida, suji and chokar is only reconstructed at month end, nobody can tell a bad run from a good one while it is still fixable.`,
  },
  {
    slug: 'oil-mill-software',
    name: 'Oil mill',
    h1: 'Free oil mill software',
    title: 'Free Oil Mill Software — Gate, Stock & Khata',
    description:
      'Free software for Indian oil mills and expellers: seed intake at the gate and weighbridge, live stock by lot and godown, supplier and buyer khata, and the owner\'s nightly digest. No cost, no card.',
    input: 'oilseed',
    outputs: 'crude oil and oil cake',
    reality: `An expeller unit lives or dies on recovery: the oil percentage you get out of a given seed lot, and the cake you are left with. Both move with seed quality, and seed quality is decided at intake — which makes the gate the single most valuable measuring point in the mill, exactly as it is in rice.`,
    leak: `Oil recovery is a percentage that nobody notices drifting. A point of recovery lost across a season is a large number, and because cake is sold separately and often informally, the two halves of the yield rarely get compared against the seed that produced them.`,
  },
  {
    slug: 'dal-mill-software',
    name: 'Dal mill',
    h1: 'Free dal mill software',
    title: 'Free Dal Mill Software — Gate, Stock & Khata',
    description:
      'Free software for Indian dal mills and pulse processing units: gate and weighbridge capture, live stock by lot and godown, supplier and buyer khata, and the owner\'s night digest. No cost, no card.',
    input: 'pulses',
    outputs: 'dal, chuni, husk and broken',
    reality: `Dal milling runs multiple passes — cleaning, dehusking, splitting, polishing — and weight moves at each one. The recovery on a pulse lot varies sharply with how the crop was grown and stored, so two lots bought at the same rate can produce very different yields, and a mill that does not measure per lot cannot tell which supplier is actually worth the rate.`,
    leak: `Multi-stage processing means several points where weight changes and nothing is recorded. Broken and chuni have value and leave quietly, so the difference between a genuinely poor lot and a leak is invisible without a per-lot balance.`,
  },
  {
    slug: 'sugar-mill-software',
    name: 'Sugar mill',
    h1: 'Free sugar mill software',
    title: 'Free Sugar Mill Software — Gate, Stock & Khata',
    description:
      'Free software for sugar mills: cane weighment at the gate, live stock by lot and godown, grower and buyer khata, and the owner\'s nightly digest. No cost, no card.',
    input: 'cane',
    outputs: 'sugar, molasses, bagasse and press mud',
    reality: `Cane arrives continuously through a crushing season, from a large number of growers, and the weighbridge is effectively the cash register — grower payment is decided there. The by-product side is substantial and independently valuable, with molasses and bagasse both carrying real markets of their own.`,
    leak: `A very high count of grower weighments, each one a payment decision, is the definition of a place where small errors compound. And with several valuable by-product streams leaving separately, the total picture only exists if every stream is tied back to the cane that produced it.`,
  },
];
