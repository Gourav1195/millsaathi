/* Demo mill dataset — mirrors the /api/overview response shape. Numbers match the approved design. */
(function () {
  function day(off) {
    return new Date(Date.now() - off * 86400000).toISOString().slice(0, 10);
  }
  function iso(off) {
    return new Date(Date.now() - off * 86400000).toISOString();
  }

  var week = [
    { date: day(6), in_kg: 88000, out_kg: 59000 }, { date: day(5), in_kg: 94000, out_kg: 62000 },
    { date: day(4), in_kg: 101000, out_kg: 66000 }, { date: day(3), in_kg: 76000, out_kg: 52000 },
    { date: day(2), in_kg: 82000, out_kg: 54000 }, { date: day(1), in_kg: 99000, out_kg: 65000 },
    { date: day(0), in_kg: 104000, out_kg: 69000 },
  ];

  window.DEMO_OVERVIEW = {
    me: { name: 'Ramesh Reddy', role: 'owner' },
    mill: { name: 'Sri Venkatesh Rice Mill', plan: 'professional', loss_limit_pct: 3, season_label: 'Kharif season' },
    today: day(0),
    kpis: {
      gross_margin_today_paise: 39000000, sale_value_paise: 629000000, purchase_value_paise: 590000000,
      unexplained_pct: 5.0, cash_paid_today_paise: 239000000, cash_received_today_paise: 210000000,
      stock_value_paise: 2140000000, trucks_in_queue: 6, weighed_today: 42, paddy_in_today_kg: 104000,
      rice_out_today_kg: 69000, avg_moisture: 14.1, lab_pending: 4,
      payables_paise: 186000000, receivables_paise: 312000000, advances_open_paise: 75000000,
    },
    mass_balance: { in_kg: 100000, rice_kg: 67000, bran_kg: 8000, husk_kg: 20000, broken_kg: 0, unexplained_kg: 5000, unexplained_pct: 5.0 },
    week: week,
    alerts: [
      { level: 'red', title: 'Unexplained loss 5.0% today', body: 'Above your 3% limit — concentrated in 3 lots on the boiled line.' },
      { level: 'amber', title: 'LOT-0912 moisture drift', body: 'Sona Masuri in Godown A up to 13.8% — check aeration before it slips further.' },
      { level: 'blue', title: 'SAU-1184 disputed', body: 'Sri Balaji Agro contests bag count on 1010 — needs your call.' },
    ],
    gate: [
      { id: 'g1', token_no: 'TKN-4821', direction: 'in', vehicle_no: 'AP 16 TG 5544', supplier_name: 'K. Ramulu', item_name: 'Paddy – Sona Masuri', gross_kg: null, tare_kg: null, moisture_pct: null, status: 'at_gate' },
      { id: 'g2', token_no: 'TKN-4820', direction: 'in', vehicle_no: 'TS 09 UB 2210', supplier_name: 'Mahalaxmi Traders', item_name: 'Paddy – BPT', gross_kg: 28640, tare_kg: null, moisture_pct: null, status: 'weighing' },
      { id: 'g3', token_no: 'TKN-4819', direction: 'in', vehicle_no: 'AP 02 CG 8891', supplier_name: 'V. Nageswara Rao', item_name: 'Paddy – Sona Masuri', gross_kg: 31200, tare_kg: 5800, moisture_pct: 13.9, status: 'in_lab' },
      { id: 'g4', token_no: 'TKN-4818', direction: 'in', vehicle_no: 'KA 05 MN 1204', supplier_name: 'Sri Balaji Agro', item_name: 'Paddy – 1010', gross_kg: 26980, tare_kg: 5180, moisture_pct: 14.6, status: 'weighed' },
      { id: 'g5', token_no: 'TKN-4817', direction: 'in', vehicle_no: 'TS 11 KL 6620', supplier_name: 'K. Ramulu', item_name: 'Paddy – Sona Masuri', gross_kg: 30110, tare_kg: 5910, moisture_pct: 13.5, status: 'unloading' },
      { id: 'g6', token_no: 'TKN-4816', direction: 'in', vehicle_no: 'AP 16 TB 3345', supplier_name: 'Ravi Kiran Bros', item_name: 'Paddy – BPT', gross_kg: 29400, tare_kg: 5800, moisture_pct: 14.2, status: 'done' },
    ],
    saudas: [
      { id: 's1', code: 'SAU-1187', broker_name: 'Mahalaxmi Traders', supplier_name: 'K. Ramulu', item_name: 'Sona Masuri', qty_kg: 25000, rate_paise_per_qtl: 232000, moisture_pct: 14.2, value_paise: 58000000, status: 'open' },
      { id: 's2', code: 'SAU-1186', broker_name: 'Direct', supplier_name: 'V. Nageswara Rao', item_name: 'Sona Masuri', qty_kg: 25400, rate_paise_per_qtl: 234000, moisture_pct: 13.9, value_paise: 59400000, status: 'settled' },
      { id: 's3', code: 'SAU-1185', broker_name: 'Ravi Kiran Bros', supplier_name: 'Ravi Kiran Bros', item_name: 'BPT', qty_kg: 23600, rate_paise_per_qtl: 241000, moisture_pct: 14.2, value_paise: 56900000, status: 'advance_paid' },
      { id: 's4', code: 'SAU-1184', broker_name: 'Direct', supplier_name: 'Sri Balaji Agro', item_name: '1010', qty_kg: 21800, rate_paise_per_qtl: 218000, moisture_pct: 14.6, value_paise: 47500000, status: 'disputed' },
      { id: 's5', code: 'SAU-1183', broker_name: 'Mahalaxmi Traders', supplier_name: 'Local pool', item_name: 'Sona Masuri', qty_kg: 48000, rate_paise_per_qtl: 230000, moisture_pct: 13.7, value_paise: 110400000, status: 'settled' },
      { id: 's6', code: 'SAU-1182', broker_name: 'Direct', supplier_name: 'K. Ramulu', item_name: 'BPT', qty_kg: 30000, rate_paise_per_qtl: 239500, moisture_pct: 14.0, value_paise: 71900000, status: 'open' },
    ],
    lots: [
      { id: 'l1', code: 'LOT-0912', godown_name: 'Godown A', item_name: 'Sona Masuri Paddy', qty_kg: 42000, moisture_pct: 13.8, in_date: day(4), value_paise: 97000000 },
      { id: 'l2', code: 'LOT-0911', godown_name: 'Godown A', item_name: 'BPT Paddy', qty_kg: 31000, moisture_pct: 14.1, in_date: day(5), value_paise: 74000000 },
      { id: 'l3', code: 'LOT-0908', godown_name: 'Godown B', item_name: 'Sona Masuri Raw Rice', qty_kg: 26000, moisture_pct: 12.4, in_date: day(6), value_paise: 122000000 },
      { id: 'l4', code: 'LOT-0905', godown_name: 'Godown C', item_name: '1010 Paddy', qty_kg: 18000, moisture_pct: 14.5, in_date: day(7), value_paise: 39000000 },
      { id: 'l5', code: 'LOT-0903', godown_name: 'Godown B', item_name: 'Rice Bran', qty_kg: 9600, moisture_pct: null, in_date: day(7), value_paise: 18000000 },
      { id: 'l6', code: 'LOT-0901', godown_name: 'Godown D', item_name: 'Broken Rice', qty_kg: 14000, moisture_pct: null, in_date: day(8), value_paise: 46000000 },
    ],
    godowns: [
      { id: 'gd1', name: 'Godown A', capacity_qtl: 3640, stock_kg: 284000 },
      { id: 'gd2', name: 'Godown B', capacity_qtl: 3540, stock_kg: 191000 },
      { id: 'gd3', name: 'Godown C', capacity_qtl: 2060, stock_kg: 64000 },
      { id: 'gd4', name: 'Godown D', capacity_qtl: 2400, stock_kg: 221000 },
    ],
    suppliers: [
      { id: 'su1', name: 'K. Ramulu', type: 'farmer', place: 'Nandyal', supplied_kg: 124000, outstanding_paise: 24000000, last_at: iso(0) },
      { id: 'su2', name: 'Mahalaxmi Traders', type: 'broker', place: 'Kurnool', supplied_kg: 368000, outstanding_paise: 61000000, last_at: iso(0) },
      { id: 'su3', name: 'V. Nageswara Rao', type: 'farmer', place: 'Banaganapalle', supplied_kg: 89000, outstanding_paise: 0, last_at: iso(0) },
      { id: 'su4', name: 'Sri Balaji Agro', type: 'trader', place: 'Adoni', supplied_kg: 211000, outstanding_paise: 38000000, last_at: iso(1) },
      { id: 'su5', name: 'Ravi Kiran Bros', type: 'broker', place: 'Guntur', supplied_kg: 156000, outstanding_paise: 29000000, last_at: iso(2) },
      { id: 'su6', name: 'P. Subbaiah', type: 'farmer', place: 'Nandyal', supplied_kg: 61000, outstanding_paise: 0, last_at: iso(4) },
    ],
    buyers: [
      { id: 'b1', name: 'Sri Annapurna Foods', type: 'Wholesaler', location: 'Hyderabad', bought_kg: 82000, receivable_paise: 61000000, last_at: iso(2) },
      { id: 'b2', name: 'Ganesh Rice Depot', type: 'Distributor', location: 'Bengaluru', bought_kg: 124000, receivable_paise: 0, last_at: iso(0) },
      { id: 'b3', name: 'Metro Cash & Carry', type: 'Retailer', location: 'Hyderabad', bought_kg: 56000, receivable_paise: 42000000, last_at: iso(5) },
      { id: 'b4', name: 'Krishna Oil Mills', type: 'Bran buyer', location: 'Vijayawada', bought_kg: 31000, receivable_paise: 11000000, last_at: iso(1) },
      { id: 'b5', name: 'Deccan Poultry Feed', type: 'Husk buyer', location: 'Nalgonda', bought_kg: 98000, receivable_paise: 0, last_at: iso(3) },
      { id: 'b6', name: 'Sunrise Exports', type: 'Exporter', location: 'Chennai', bought_kg: 64000, receivable_paise: 84000000, last_at: iso(6) },
    ],
    items: [
      { id: 'i1', name: 'Sona Masuri', category: 'paddy', hsn: '1006', stock_kg: 284000, typical_otr_pct: null, unit: 'Quintal' },
      { id: 'i2', name: 'BPT (Samba)', category: 'paddy', hsn: '1006', stock_kg: 112000, typical_otr_pct: null, unit: 'Quintal' },
      { id: 'i3', name: '1010', category: 'paddy', hsn: '1006', stock_kg: 64000, typical_otr_pct: null, unit: 'Quintal' },
      { id: 'i4', name: 'Sona Masuri Raw Rice', category: 'rice', hsn: '1006', stock_kg: 134000, typical_otr_pct: 67, unit: 'Quintal' },
      { id: 'i5', name: 'BPT Boiled Rice', category: 'rice', hsn: '1006', stock_kg: 72000, typical_otr_pct: 68, unit: 'Quintal' },
      { id: 'i6', name: 'Rice Bran', category: 'byproduct', hsn: '2302', stock_kg: 9600, typical_otr_pct: 8, unit: 'Quintal' },
      { id: 'i7', name: 'Broken Rice', category: 'byproduct', hsn: '1006', stock_kg: 14000, typical_otr_pct: 5, unit: 'Quintal' },
      { id: 'i8', name: 'Husk', category: 'byproduct', hsn: '1213', stock_kg: 38000, typical_otr_pct: 20, unit: 'Quintal' },
    ],
  };

  window.DEMO_DIGEST = {
    date: day(0),
    trucks_in: 42,
    paddy_in_kg: 104000,
    dispatched_kg: 69000,
    cash_paid_paise: 239000000,
    mass_balance: window.DEMO_OVERVIEW.mass_balance,
    text: '',
    // Sign-off drops the Devanagari tagline outside India, matching the .deva
    // lines the <head> region script hides — this string is plain text, so CSS
    // cannot reach it.
    wa_share_url: 'https://wa.me/?text=' + encodeURIComponent(
      '*Sri Venkatesh Rice Mill* — Night Digest\nPaddy in: 42 trucks · 1,040 qtl\nDispatched: 690 qtl\nCash paid: ₹23.9 L\nUnexplained loss: 5.0% ⚠ above your 3% limit\n' +
      (document.documentElement.getAttribute('data-region') === 'intl'
        ? '— MillSaathi'
        : '— MillSaathi · पता चलेगा माल कहाँ जा रहा है।')
    ),
  };
})();
