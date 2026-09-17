INSERT INTO billing_accounts (id, mill_id, provider)
SELECT lower(hex(randomblob(16))), m.id, 'razorpay'
FROM mills m
WHERE NOT EXISTS (SELECT 1 FROM billing_accounts b WHERE b.mill_id = m.id);
