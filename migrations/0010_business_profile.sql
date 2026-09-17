-- Optional organisation identity used on operational documents. Existing mills remain valid.
ALTER TABLE mills ADD COLUMN address TEXT;
ALTER TABLE mills ADD COLUMN phone TEXT;
ALTER TABLE mills ADD COLUMN email TEXT;
ALTER TABLE mills ADD COLUMN gstin TEXT;
ALTER TABLE mills ADD COLUMN place_of_supply TEXT;
