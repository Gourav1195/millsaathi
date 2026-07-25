// State landing pages.
//
// Rule for this file: every state must carry real, state-specific substance —
// how milling actually works there, which language the mill floor speaks, what
// the local leak looks like. Near-identical pages with the state name swapped
// are doorway pages and Google treats them as such. If you cannot write
// something true and specific about a state, do not add it here.
//
// Deliberately qualitative. Do not add production statistics or procurement
// figures to these pages unless you have a current, citable source — a wrong
// number on a page a mill owner knows better than you destroys the whole pitch.

export const states = [
  {
    slug: 'chhattisgarh',
    name: 'Chhattisgarh',
    langs: 'Hindi and Chhattisgarhi',
    hubs: 'Raipur, Durg, Bilaspur, Dhamtari and Mahasamund',
    reality: `Milling in Chhattisgarh runs on custom milling more than on open-market trade. A large share of the state's paddy moves through procurement, and mills take delivery to return rice against a fixed outturn ratio and a delivery schedule. That changes the economics completely: your recovery target is set by the order rather than by your machinery, and the penalty for falling short is yours to absorb.`,
    pains: [
      'Custom milling means a fixed outturn obligation — every point you fall short of the ratio comes straight out of your own pocket, so knowing your true recovery per lot is not optional',
      'Paddy lifted from procurement centres arrives in large, uneven consignments, and quality varies between lots that all end up in the same godown unless you record them separately',
      'Delivery deadlines against the order push mills to run hard and reconcile later — which is exactly when bag counts and stock positions drift',
    ],
    faqs: [
      {
        q: 'Does MillSaathi work for custom milling in Chhattisgarh?',
        a: 'Yes. Custom milling makes per-lot recovery more important, not less — because your obligation is a fixed ratio and any shortfall is your loss. MillSaathi captures each lot at the gate and weighbridge and runs the mass balance against it, so you can see your real outturn as the season runs rather than discovering the gap when you settle.',
      },
      {
        q: 'Can my staff in Raipur or Dhamtari use it in Hindi?',
        a: 'It runs in any browser on a mid-range Android with nothing to install, which is the practical requirement at a gate in Chhattisgarh. Hindi on the mill floor is on the roadmap; the workflow itself is built around numbers, weights and lot IDs rather than long English sentences.',
      },
    ],
  },
  {
    slug: 'punjab',
    name: 'Punjab',
    langs: 'Punjabi and Hindi',
    hubs: 'Amritsar, Ludhiana, Patiala, Jalandhar and Bathinda',
    reality: `Punjab mills work against a mandi system with arhtiyas in the middle of almost every purchase, and a season that arrives in a compressed, brutal rush. Many mills run both a procurement line and a basmati line, and those two businesses have completely different economics — one is a fixed ratio obligation, the other is a quality-graded export trade where a fraction of a percent on broken grain moves the price.`,
    pains: [
      'Running procurement and basmati through the same yard means two sets of economics in one set of registers — and the basmati lots are the ones where a quality reading is worth real money',
      'The arhtiya sits between you and the farmer, so the paperwork trail and the physical lot often arrive separately and get reconciled from memory',
      'Peak-season queues are long enough that the moisture meter gets skipped "just for this truck", which is precisely when it matters most',
    ],
    faqs: [
      {
        q: 'Does MillSaathi handle basmati quality grading?',
        a: 'The Lab module records moisture, broken percentage and grade against the specific lot before the purchase is priced, which is the part that matters for basmati — the reading is tied to the lot rather than written on a slip that gets lost. Export documentation itself is not built yet.',
      },
      {
        q: 'Can it handle arhtiya and broker purchases?',
        a: 'Yes — the Saudas module tracks broker deals, advances and rate agreements through to settlement, lot by lot, which is the usual gap when the commercial trail and the physical lot arrive at different times.',
      },
    ],
  },
  {
    slug: 'haryana',
    name: 'Haryana',
    langs: 'Hindi and Haryanvi',
    hubs: 'Karnal, Taraori, Kaithal, Kurukshetra and Fatehabad',
    reality: `Haryana's rice belt around Karnal and Taraori is built on basmati, and a large part of it is oriented towards export buyers who specify quality tightly. That makes the lab reading a commercial document rather than a formality: broken percentage, grain length and moisture decide the rate, and a lot that gets blended into a heap before it is graded has lost the argument before it starts.`,
    pains: [
      'Export buyers specify quality precisely, so an ungraded lot mixed into the godown cannot be priced or traced back afterwards',
      'Basmati carries enough value per quintal that ordinary weighbridge drift costs several times what it would in a coarse-rice mill',
      'Ageing and storage stock sits for long periods, and a stock position that is only reconciled monthly is not a stock position at all',
    ],
    faqs: [
      {
        q: 'Is MillSaathi suitable for a basmati mill in Karnal?',
        a: 'The per-lot capture is the relevant part: quality is recorded against the lot at intake, stock stays traceable godown-by-godown and lot-by-lot rather than as one heap, and the mass balance runs on the actual weights. Export paperwork is not built yet, so it complements rather than replaces whatever you use for documentation.',
      },
      {
        q: 'Can I track lots that sit in storage for ageing?',
        a: 'Yes. Inventory is tracked live by lot, variety and godown rather than as a monthly total, so a lot held for ageing keeps its identity — including its intake quality reading — for as long as it sits.',
      },
    ],
  },
  {
    slug: 'telangana',
    name: 'Telangana',
    langs: 'Telugu, Hindi and Urdu',
    hubs: 'Nizamabad, Karimnagar, Warangal, Nalgonda and Miryalaguda',
    reality: `Telangana mills handle very large procurement volumes and a great deal of parboiled rice, which adds soaking and drying stages between intake and milling. Every one of those stages moves weight, and a mill that only weighs at the two ends of the process has no way to tell process loss from a leak.`,
    pains: [
      'Parboiling adds soaking and drying between intake and milling, so weight moves at several points and a single start-to-finish weighing explains nothing',
      'High procurement volumes mean big consignments arriving faster than a paper register can honestly keep up with',
      'The mill floor speaks Telugu while the software and the paperwork are usually in English, so entry gets delegated to whoever can read the screen',
    ],
    faqs: [
      {
        q: 'Does MillSaathi work for parboiled rice mills?',
        a: 'Yes. The production and mass balance module works on paddy in versus rice, bran and husk out for each run, so the extra parboiling stages are captured as part of the balance rather than being a black box between intake and dispatch.',
      },
      {
        q: 'Is it available in Telugu?',
        a: 'Telugu for the mill floor is on the roadmap alongside Hindi and Tamil. Today the interface is English but is built around weights, lot numbers and quantities rather than dense text, and it runs in a browser on any mid-range Android at the gate.',
      },
    ],
  },
  {
    slug: 'andhra-pradesh',
    name: 'Andhra Pradesh',
    langs: 'Telugu',
    hubs: 'the Godavari delta, Nellore, Kakinada, Rajahmundry and Vijayawada',
    reality: `The delta districts hold some of the largest and oldest mills in the country, many of them running boiled rice at serious scale with several godowns and more than one weighbridge. At that size the problem stops being whether records exist and becomes whether the records from different points in the mill agree with each other.`,
    pains: [
      'Multiple godowns and more than one weighing point mean several parallel records that only get compared when something has already gone wrong',
      'Large mills run several shifts, so the person who weighed a lot is rarely the person who dispatches it, and the handover is verbal',
      'Long-standing supplier relationships mean a lot of purchases run on trust and get formalised later, if at all',
    ],
    faqs: [
      {
        q: 'Can MillSaathi handle a large mill with multiple godowns?',
        a: 'Yes — stock is tracked live by lot, variety and godown, so each store has its own position rather than everything collapsing into one number. Role-locked entry also means the operator, manager, accountant and owner each see and change only what they should, which matters more as the mill gets bigger.',
      },
      {
        q: 'Does it work across shifts?',
        a: 'The record is the handover. Each lot is captured once at the source with the token, gate entry, weights and lab reading attached to it, so the next shift picks up a lot with its history rather than a verbal summary.',
      },
    ],
  },
  {
    slug: 'uttar-pradesh',
    name: 'Uttar Pradesh',
    langs: 'Hindi',
    hubs: 'Bareilly, Gonda, Shahjahanpur, Pilibhit and Bulandshahr',
    reality: `Uttar Pradesh has an enormous number of mills spread very thin, and most of them are family-run operations where the owner is also the buyer, the credit manager and the person who settles disputes. The constraint is not sophistication — it is that one person cannot personally watch a gate, a bridge and a godown at the same time, and the munshi's register is the only thing standing in for them.`,
    pains: [
      'The owner is the system — when he is at a mandi or a wedding, the record is whatever gets remembered later',
      'Small mills cannot justify a Windows licence and an operator, so most of them run on paper and a phone',
      'Supplier khata runs on long informal credit, and the balance everyone agrees on is the one nobody has written down',
    ],
    faqs: [
      {
        q: 'Is this practical for a small family-run mill?',
        a: 'That is the case it was built for. There is nothing to install, it runs in a browser on the phone you already own, it is free with unlimited users, and the owner gets a night digest so the mill is legible even on a day he was not there.',
      },
      {
        q: 'Do I need a computer or an IT person?',
        a: 'No. It opens in a browser on a mid-range Android, and there is no server to run or licence to renew. That is deliberate — the people entering data stand at a dusty gate with two bars of signal, not at a desk.',
      },
    ],
  },
  {
    slug: 'west-bengal',
    name: 'West Bengal',
    langs: 'Bengali and Hindi',
    hubs: 'Bardhaman, Hooghly, Murshidabad, Nadia and Medinipur',
    reality: `West Bengal has a very large number of mills at the small and medium end, drawing paddy from a fragmented supply of small farmers rather than from a handful of big consignments. That means many small purchases, each one an opportunity for a weight and a moisture reading to be settled by conversation instead of by record.`,
    pains: [
      'Paddy arrives in many small lots from many small suppliers, so the volume of individual purchase decisions per day is very high',
      'A fragmented supply base means quality varies lot to lot, and lots get mixed before anyone measures anything',
      'The sheer count of transactions makes a paper register slow enough that entries get batched at the end of the day from memory',
    ],
    faqs: [
      {
        q: 'Does it work for a mill buying from many small farmers?',
        a: 'Yes, and that is the harder case. Each lot is captured once at the gate with its own weight and quality reading and stays identifiable afterwards, so a high count of small purchases stops being a reason to reconcile from memory at closing time.',
      },
      {
        q: 'Is there a limit on how many transactions or users I get?',
        a: 'No. MillSaathi is free with unlimited users and unlimited lots — there is no per-user charge and no transaction cap, so a busy gate does not cost more than a quiet one.',
      },
    ],
  },
  {
    slug: 'odisha',
    name: 'Odisha',
    langs: 'Odia and Hindi',
    hubs: 'Bargarh, Sambalpur, Bhadrak, Balasore and Ganjam',
    reality: `A large share of Odisha's paddy reaches mills through procurement routed via primary cooperative societies, which means the commercial counterparty and the physical lot often arrive through different channels. Mills in belts like Bargarh and Sambalpur work substantial volumes against delivery obligations, on margins that leave very little room for an unexplained gap.`,
    pains: [
      'Paddy arriving via cooperative societies separates the paperwork trail from the physical lot, and the two get reconciled long after both have moved',
      'Delivery obligations against procurement leave no room to absorb a recovery shortfall you did not know you had',
      'Seasonal labour at the gate means the person recording weights changes through the season, and so does the quality of the record',
    ],
    faqs: [
      {
        q: 'Can MillSaathi track paddy lifted through cooperative societies?',
        a: 'Yes. The lot is captured physically at your gate and weighbridge regardless of which channel it came through, and the supplier side is tracked separately in the khata — so the physical record and the commercial record can be compared instead of assumed to match.',
      },
      {
        q: 'What happens when gate staff change mid-season?',
        a: 'Role-locked entry means a new operator can only do the operator workflow — token, gross, tare, lab, done — and cannot quietly rewrite anything behind it. The record survives the person, which is the point.',
      },
    ],
  },
];
