-- Mill type chosen at signup. Existing mills stay rice mills.
ALTER TABLE mills ADD COLUMN mill_type TEXT NOT NULL DEFAULT 'RICE';
