CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pass_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  campaign TEXT NOT NULL,
  slot TEXT NOT NULL,
  arrival TEXT NOT NULL,
  discount_eligible INTEGER NOT NULL DEFAULT 0 CHECK (discount_eligible IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
