-- Demo mill matching the approved design (Sri Venkatesh Rice Mill).
-- Logins (password for all three: demo1234):
--   owner@demo.millsaathi.com / manager@demo.millsaathi.com / accounts@demo.millsaathi.com
-- Dates are relative to 'now' so the dashboard always looks alive.

INSERT INTO mills (id, name, slug, plan, loss_limit_pct) VALUES
  ('mill-demo', 'Sri Venkatesh Rice Mill', 'sri-venkatesh', 'professional', 3.0);

INSERT INTO users (id, mill_id, name, email, role, pass_hash, pass_salt) VALUES
  ('user-owner', 'mill-demo', 'Ramesh Reddy',  'owner@demo.millsaathi.com',    'owner',      'N37RSDzMkOLE9Kmqdh2jxoFMzchNQrDmGeSJWanEz38=', 'bWlsbHNhYXRoaS1kZW1vMQ=='),
  ('user-mgr',   'mill-demo', 'Suresh Kumar',  'manager@demo.millsaathi.com',  'manager',    'N37RSDzMkOLE9Kmqdh2jxoFMzchNQrDmGeSJWanEz38=', 'bWlsbHNhYXRoaS1kZW1vMQ=='),
  ('user-acct',  'mill-demo', 'Prakash Rao',   'accounts@demo.millsaathi.com', 'accountant', 'N37RSDzMkOLE9Kmqdh2jxoFMzchNQrDmGeSJWanEz38=', 'bWlsbHNhYXRoaS1kZW1vMQ==');

INSERT INTO suppliers (id, mill_id, name, type, place) VALUES
  ('sup-1', 'mill-demo', 'K. Ramulu', 'farmer', 'Nandyal'),
  ('sup-2', 'mill-demo', 'Mahalaxmi Traders', 'broker', 'Kurnool'),
  ('sup-3', 'mill-demo', 'V. Nageswara Rao', 'farmer', 'Banaganapalle'),
  ('sup-4', 'mill-demo', 'Sri Balaji Agro', 'trader', 'Adoni'),
  ('sup-5', 'mill-demo', 'Ravi Kiran Bros', 'broker', 'Guntur'),
  ('sup-6', 'mill-demo', 'P. Subbaiah', 'farmer', 'Nandyal');

INSERT INTO buyers (id, mill_id, name, type, location) VALUES
  ('buy-1', 'mill-demo', 'Sri Annapurna Foods', 'Wholesaler', 'Hyderabad'),
  ('buy-2', 'mill-demo', 'Ganesh Rice Depot', 'Distributor', 'Bengaluru'),
  ('buy-3', 'mill-demo', 'Metro Cash & Carry', 'Retailer', 'Hyderabad'),
  ('buy-4', 'mill-demo', 'Krishna Oil Mills', 'Bran buyer', 'Vijayawada'),
  ('buy-5', 'mill-demo', 'Deccan Poultry Feed', 'Husk buyer', 'Nalgonda'),
  ('buy-6', 'mill-demo', 'Sunrise Exports', 'Exporter', 'Chennai');

INSERT INTO items (id, mill_id, name, category, hsn, typical_otr_pct) VALUES
  ('itm-sona',   'mill-demo', 'Sona Masuri', 'paddy', '1006', NULL),
  ('itm-bpt',    'mill-demo', 'BPT (Samba)', 'paddy', '1006', NULL),
  ('itm-1010',   'mill-demo', '1010', 'paddy', '1006', NULL),
  ('itm-sonar',  'mill-demo', 'Sona Masuri Raw Rice', 'rice', '1006', 67),
  ('itm-bptb',   'mill-demo', 'BPT Boiled Rice', 'rice', '1006', 68),
  ('itm-bran',   'mill-demo', 'Rice Bran', 'byproduct', '2302', 8),
  ('itm-broken', 'mill-demo', 'Broken Rice', 'byproduct', '1006', 5),
  ('itm-husk',   'mill-demo', 'Husk', 'byproduct', '1213', 20);

INSERT INTO godowns (id, mill_id, name, capacity_qtl) VALUES
  ('gd-a', 'mill-demo', 'Godown A', 3600),
  ('gd-b', 'mill-demo', 'Godown B', 3550),
  ('gd-c', 'mill-demo', 'Godown C', 2050),
  ('gd-d', 'mill-demo', 'Godown D', 2400);

-- Default linear routing used by the Processing Chain workspace.
INSERT INTO process_types (id, mill_id, name, description) VALUES
  ('pt-clean', 'mill-demo', 'Pre-Cleaning', 'Remove dust, stones and foreign matter before milling.'),
  ('pt-hull', 'mill-demo', 'De-husking (Hulling)', 'Separate husk from paddy.'),
  ('pt-separate', 'mill-demo', 'Paddy Separation', 'Separate paddy and brown rice.'),
  ('pt-white', 'mill-demo', 'Whitening and Polishing', 'Whiten and polish brown rice to finished rice.'),
  ('pt-grade', 'mill-demo', 'Grading and Color Sorting', 'Grade kernels and remove discolored grains.'),
  ('pt-pack', 'mill-demo', 'Weighing and Packaging', 'Weigh, pack and prepare finished goods for dispatch.');

INSERT INTO processing_chains (id, mill_id, name, description, input_category, expected_yield_pct) VALUES
  ('chain-demo-rice', 'mill-demo', 'Rice Milling Pipeline', 'Default end-to-end rice milling chain: Pre-Cleaning through Packaging.', 'paddy', 67.0);

INSERT INTO processing_chain_steps (id, mill_id, chain_id, process_type_id, step_number) VALUES
  ('chain-step-1', 'mill-demo', 'chain-demo-rice', 'pt-clean', 1),
  ('chain-step-2', 'mill-demo', 'chain-demo-rice', 'pt-hull', 2),
  ('chain-step-3', 'mill-demo', 'chain-demo-rice', 'pt-separate', 3),
  ('chain-step-4', 'mill-demo', 'chain-demo-rice', 'pt-white', 4),
  ('chain-step-5', 'mill-demo', 'chain-demo-rice', 'pt-grade', 5),
  ('chain-step-6', 'mill-demo', 'chain-demo-rice', 'pt-pack', 6);

INSERT INTO saudas (id, mill_id, code, supplier_id, broker_name, item_id, qty_kg, rate_paise_per_qtl, moisture_pct, status) VALUES
  ('sau-1187', 'mill-demo', 'SAU-1187', 'sup-1', 'Mahalaxmi Traders', 'itm-sona', 25000, 232000, 14.2, 'open'),
  ('sau-1186', 'mill-demo', 'SAU-1186', 'sup-3', 'Direct',            'itm-sona', 25400, 234000, 13.9, 'settled'),
  ('sau-1185', 'mill-demo', 'SAU-1185', 'sup-5', 'Ravi Kiran Bros',   'itm-bpt',  23600, 241000, 14.2, 'advance_paid'),
  ('sau-1184', 'mill-demo', 'SAU-1184', 'sup-4', 'Direct',            'itm-1010', 21800, 218000, 14.6, 'disputed'),
  ('sau-1183', 'mill-demo', 'SAU-1183', 'sup-2', 'Mahalaxmi Traders', 'itm-sona', 48000, 230000, 13.7, 'settled'),
  ('sau-1182', 'mill-demo', 'SAU-1182', 'sup-1', 'Direct',            'itm-bpt',  30000, 239500, 14.0, 'open');

INSERT INTO gate_entries (id, mill_id, token_no, direction, vehicle_no, supplier_id, item_id, sauda_id, gross_kg, tare_kg, moisture_pct, status, entry_date) VALUES
  ('ge-4821', 'mill-demo', 'TKN-4821', 'in', 'AP 16 TG 5544', 'sup-1', 'itm-sona', 'sau-1187', NULL,  NULL, NULL,  'at_gate',   date('now','+330 minutes')),
  ('ge-4820', 'mill-demo', 'TKN-4820', 'in', 'TS 09 UB 2210', 'sup-2', 'itm-bpt',  NULL,       28640, NULL, NULL,  'weighing',  date('now','+330 minutes')),
  ('ge-4819', 'mill-demo', 'TKN-4819', 'in', 'AP 02 CG 8891', 'sup-3', 'itm-sona', 'sau-1186', 31200, 5800, 13.9,  'in_lab',    date('now','+330 minutes')),
  ('ge-4818', 'mill-demo', 'TKN-4818', 'in', 'KA 05 MN 1204', 'sup-4', 'itm-1010', 'sau-1184', 26980, 5180, 14.6,  'weighed',   date('now','+330 minutes')),
  ('ge-4817', 'mill-demo', 'TKN-4817', 'in', 'TS 11 KL 6620', 'sup-1', 'itm-sona', 'sau-1187', 30110, 5910, 13.5,  'unloading', date('now','+330 minutes')),
  ('ge-4816', 'mill-demo', 'TKN-4816', 'in', 'AP 16 TB 3345', 'sup-5', 'itm-bpt',  'sau-1185', 29400, 5800, 14.2,  'done',      date('now','+330 minutes')),
  ('ge-4815', 'mill-demo', 'TKN-4815', 'in', 'TS 07 QC 9911', 'sup-2', 'itm-sona', 'sau-1183', 32400, 5600, 13.8,  'done',      date('now','+330 minutes'));

-- Historical gate entries (last 6 days) so the weekly chart has data
INSERT INTO gate_entries (id, mill_id, token_no, direction, vehicle_no, supplier_id, item_id, gross_kg, tare_kg, moisture_pct, status, entry_date) VALUES
  ('ge-h1i', 'mill-demo', 'TKN-4700', 'in', 'AP 16 AA 1001', 'sup-1', 'itm-sona', 94000, 6000, 13.9, 'done', date('now','+330 minutes','-6 days')),
  ('ge-h2i', 'mill-demo', 'TKN-4712', 'in', 'TS 09 BB 2002', 'sup-2', 'itm-bpt',  100000, 6000, 14.1, 'done', date('now','+330 minutes','-5 days')),
  ('ge-h3i', 'mill-demo', 'TKN-4728', 'in', 'AP 02 CC 3003', 'sup-3', 'itm-sona', 107000, 6000, 13.8, 'done', date('now','+330 minutes','-4 days')),
  ('ge-h4i', 'mill-demo', 'TKN-4741', 'in', 'KA 05 DD 4004', 'sup-4', 'itm-1010', 82000, 6000, 14.4, 'done', date('now','+330 minutes','-3 days')),
  ('ge-h5i', 'mill-demo', 'TKN-4755', 'in', 'TS 11 EE 5005', 'sup-1', 'itm-sona', 88000, 6000, 13.6, 'done', date('now','+330 minutes','-2 days')),
  ('ge-h6i', 'mill-demo', 'TKN-4771', 'in', 'AP 16 FF 6006', 'sup-5', 'itm-bpt',  105000, 6000, 14.0, 'done', date('now','+330 minutes','-1 days'));
INSERT INTO gate_entries (id, mill_id, token_no, direction, vehicle_no, buyer_id, item_id, gross_kg, tare_kg, rate_paise_per_qtl, status, entry_date) VALUES
  ('ge-h1o', 'mill-demo', 'TKN-4705', 'out', 'KA 01 GG 7007', 'buy-2', 'itm-sonar', 65000, 6000, 518000, 'done', date('now','+330 minutes','-6 days')),
  ('ge-h2o', 'mill-demo', 'TKN-4718', 'out', 'TS 09 HH 8008', 'buy-1', 'itm-sonar', 68000, 6000, 515000, 'done', date('now','+330 minutes','-5 days')),
  ('ge-h3o', 'mill-demo', 'TKN-4733', 'out', 'AP 07 II 9009', 'buy-6', 'itm-bptb',  72000, 6000, 530000, 'done', date('now','+330 minutes','-4 days')),
  ('ge-h4o', 'mill-demo', 'TKN-4746', 'out', 'KA 01 JJ 1010', 'buy-2', 'itm-sonar', 58000, 6000, 519000, 'done', date('now','+330 minutes','-3 days')),
  ('ge-h5o', 'mill-demo', 'TKN-4760', 'out', 'TS 09 KK 1111', 'buy-3', 'itm-sonar', 61000, 6000, 522000, 'done', date('now','+330 minutes','-2 days')),
  ('ge-h6o', 'mill-demo', 'TKN-4777', 'out', 'AP 07 LL 1212', 'buy-1', 'itm-bptb',  71000, 6000, 528000, 'done', date('now','+330 minutes','-1 days'));

-- Outbound dispatches (sales) today
INSERT INTO gate_entries (id, mill_id, token_no, direction, vehicle_no, buyer_id, item_id, gross_kg, tare_kg, rate_paise_per_qtl, status, entry_date) VALUES
  ('ge-out-1', 'mill-demo', 'TKN-4810', 'out', 'KA 01 AB 7712', 'buy-2', 'itm-sonar', 40200, 6200, 520000, 'done', date('now','+330 minutes')),
  ('ge-out-2', 'mill-demo', 'TKN-4811', 'out', 'TS 09 XY 3401', 'buy-1', 'itm-sonar', 27500, 6000, 515000, 'done', date('now','+330 minutes')),
  ('ge-out-3', 'mill-demo', 'TKN-4812', 'out', 'AP 07 CD 5520', 'buy-4', 'itm-bran',  14300, 6300, 180000, 'done', date('now','+330 minutes'));

INSERT INTO lots (id, mill_id, code, godown_id, item_id, qty_kg, moisture_pct, in_date, value_paise) VALUES
  ('lot-0912', 'mill-demo', 'LOT-0912', 'gd-a', 'itm-sona',   42000, 13.8, date('now','+330 minutes','-4 days'), 97000000),
  ('lot-0911', 'mill-demo', 'LOT-0911', 'gd-a', 'itm-bpt',    31000, 14.1, date('now','+330 minutes','-5 days'), 74000000),
  ('lot-0908', 'mill-demo', 'LOT-0908', 'gd-b', 'itm-sonar',  26000, 12.4, date('now','+330 minutes','-6 days'), 122000000),
  ('lot-0905', 'mill-demo', 'LOT-0905', 'gd-c', 'itm-1010',   18000, 14.5, date('now','+330 minutes','-7 days'), 39000000),
  ('lot-0903', 'mill-demo', 'LOT-0903', 'gd-b', 'itm-bran',    9600, NULL, date('now','+330 minutes','-7 days'), 18000000),
  ('lot-0901', 'mill-demo', 'LOT-0901', 'gd-d', 'itm-broken', 14000, NULL, date('now','+330 minutes','-8 days'), 46000000),
  ('lot-0900', 'mill-demo', 'LOT-0900', 'gd-a', 'itm-sona',  211000, 13.9, date('now','+330 minutes','-9 days'), 486000000),
  ('lot-0899', 'mill-demo', 'LOT-0899', 'gd-b', 'itm-bpt',    81000, 14.0, date('now','+330 minutes','-10 days'), 194000000),
  ('lot-0898', 'mill-demo', 'LOT-0898', 'gd-b', 'itm-sonar',  74400, 12.6, date('now','+330 minutes','-10 days'), 350000000),
  ('lot-0897', 'mill-demo', 'LOT-0897', 'gd-c', 'itm-1010',   46000, 14.3, date('now','+330 minutes','-11 days'), 100000000),
  ('lot-0896', 'mill-demo', 'LOT-0896', 'gd-d', 'itm-husk',  126800, NULL, date('now','+330 minutes','-11 days'), 32000000),
  ('lot-0895', 'mill-demo', 'LOT-0895', 'gd-d', 'itm-broken', 80200, NULL, date('now','+330 minutes','-12 days'), 264000000);

-- Production: last 7 days, today has a 5% unexplained gap (above the 3% limit)
INSERT INTO production_runs (id, mill_id, run_date, paddy_in_kg, rice_out_kg, bran_out_kg, husk_out_kg, broken_out_kg) VALUES
  ('pr-1', 'mill-demo', date('now','+330 minutes','-6 days'),  88000, 59000, 7000, 17600, 3500),
  ('pr-2', 'mill-demo', date('now','+330 minutes','-5 days'),  94000, 62900, 7500, 18800, 3800),
  ('pr-3', 'mill-demo', date('now','+330 minutes','-4 days'), 101000, 67700, 8100, 20200, 4000),
  ('pr-4', 'mill-demo', date('now','+330 minutes','-3 days'),  76000, 50900, 6100, 15200, 3000),
  ('pr-5', 'mill-demo', date('now','+330 minutes','-2 days'),  82000, 54900, 6600, 16400, 3300),
  ('pr-6', 'mill-demo', date('now','+330 minutes','-1 days'),  99000, 66300, 7900, 19800, 4000),
  ('pr-7', 'mill-demo', date('now','+330 minutes'),           100000, 67000, 8000, 20000, 0);

INSERT INTO payments (id, mill_id, party_kind, party_id, direction, amount_paise, method, pay_date) VALUES
  ('pay-1', 'mill-demo', 'supplier', 'sup-1', 'paid',     1200000000, 'bank', date('now','+330 minutes')),
  ('pay-2', 'mill-demo', 'supplier', 'sup-2', 'paid',      600000000, 'cash', date('now','+330 minutes')),
  ('pay-3', 'mill-demo', 'supplier', 'sup-4', 'paid',      590000000, 'bank', date('now','+330 minutes','-1 days')),
  ('pay-4', 'mill-demo', 'buyer',    'buy-2', 'received', 2100000000, 'bank', date('now','+330 minutes')),
  ('pay-5', 'mill-demo', 'buyer',    'buy-1', 'received',  800000000, 'bank', date('now','+330 minutes','-1 days'));

INSERT INTO counters (mill_id, key, value) VALUES
  ('mill-demo', 'token', 4821),
  ('mill-demo', 'sauda', 1187),
  ('mill-demo', 'lot', 912);

