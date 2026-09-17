CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  document_type TEXT NOT NULL CHECK (document_type IN ('PURCHASE_STATEMENT','SALES_INVOICE','PAYMENT_RECEIPT','WEIGHMENT_SLIP')),
  document_no TEXT NOT NULL,
  financial_year TEXT,
  issue_date TEXT NOT NULL DEFAULT (date('now')),
  party_kind TEXT,
  party_id TEXT,
  sauda_id TEXT REFERENCES saudas(id),
  gate_entry_id TEXT REFERENCES gate_entries(id),
  subtotal_paise INTEGER NOT NULL DEFAULT 0,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  cgst_paise INTEGER NOT NULL DEFAULT 0,
  sgst_paise INTEGER NOT NULL DEFAULT 0,
  igst_paise INTEGER NOT NULL DEFAULT 0,
  cess_paise INTEGER NOT NULL DEFAULT 0,
  rounding_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT','POSTED','VOID')),
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  voided_at TEXT,
  voided_by TEXT
);
CREATE UNIQUE INDEX idx_documents_no ON documents(mill_id, document_no);
CREATE TABLE document_lines (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  document_id TEXT NOT NULL REFERENCES documents(id),
  item_id TEXT REFERENCES items(id),
  description TEXT NOT NULL,
  hsn TEXT,
  quantity REAL,
  unit TEXT,
  rate_paise INTEGER NOT NULL DEFAULT 0,
  taxable_paise INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_document_lines_doc ON document_lines(mill_id, document_id);
