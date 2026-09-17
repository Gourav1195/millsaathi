-- Give every existing mill a useful starting process catalog without overwriting custom types.
INSERT INTO process_types (id, mill_id, name, description)
SELECT lower(hex(randomblob(16))), id, 'Pre-Cleaning', 'Remove dust, stones and foreign matter before milling.' FROM mills m
WHERE NOT EXISTS (SELECT 1 FROM process_types p WHERE p.mill_id = m.id AND p.name = 'Pre-Cleaning' AND p.deleted_at IS NULL);
INSERT INTO process_types (id, mill_id, name, description)
SELECT lower(hex(randomblob(16))), id, 'De-husking (Hulling)', 'Separate husk from paddy.' FROM mills m
WHERE NOT EXISTS (SELECT 1 FROM process_types p WHERE p.mill_id = m.id AND p.name = 'De-husking (Hulling)' AND p.deleted_at IS NULL);
INSERT INTO process_types (id, mill_id, name, description)
SELECT lower(hex(randomblob(16))), id, 'Paddy Separation', 'Separate paddy and brown rice after hulling.' FROM mills m
WHERE NOT EXISTS (SELECT 1 FROM process_types p WHERE p.mill_id = m.id AND p.name = 'Paddy Separation' AND p.deleted_at IS NULL);
INSERT INTO process_types (id, mill_id, name, description)
SELECT lower(hex(randomblob(16))), id, 'Whitening and Polishing', 'Whiten and polish brown rice to finished rice.' FROM mills m
WHERE NOT EXISTS (SELECT 1 FROM process_types p WHERE p.mill_id = m.id AND p.name = 'Whitening and Polishing' AND p.deleted_at IS NULL);
INSERT INTO process_types (id, mill_id, name, description)
SELECT lower(hex(randomblob(16))), id, 'Grading and Color Sorting', 'Grade kernels and remove discolored grains.' FROM mills m
WHERE NOT EXISTS (SELECT 1 FROM process_types p WHERE p.mill_id = m.id AND p.name = 'Grading and Color Sorting' AND p.deleted_at IS NULL);
INSERT INTO process_types (id, mill_id, name, description)
SELECT lower(hex(randomblob(16))), id, 'Weighing and Packaging', 'Weigh, pack and prepare finished goods for dispatch.' FROM mills m
WHERE NOT EXISTS (SELECT 1 FROM process_types p WHERE p.mill_id = m.id AND p.name = 'Weighing and Packaging' AND p.deleted_at IS NULL);
