-- Sales invoices reuse documents and document_lines; uploads are metadata plus a small D1-held file.
ALTER TABLE documents ADD COLUMN source TEXT NOT NULL DEFAULT 'GENERATED';
ALTER TABLE documents ADD COLUMN upload_name TEXT;
ALTER TABLE documents ADD COLUMN upload_mime TEXT;
ALTER TABLE documents ADD COLUMN upload_data BLOB;
ALTER TABLE document_lines ADD COLUMN gst_rate_pct REAL;
ALTER TABLE payments ADD COLUMN document_id TEXT REFERENCES documents(id);
CREATE INDEX idx_payments_document ON payments(mill_id, document_id, status);
