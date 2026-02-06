CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY NOT NULL,
  agency TEXT NOT NULL,
  organization TEXT,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  request_date TEXT,
  completion_date TEXT,
  entry_date TEXT,
  fee TEXT,
  is_amended INTEGER DEFAULT 0,
  subject TEXT,
  details TEXT,
  resolution TEXT,
  response TEXT
);

CREATE INDEX IF NOT EXISTS idx_entries_agency ON entries(agency);
CREATE INDEX IF NOT EXISTS idx_entries_request_date ON entries(request_date);
CREATE INDEX IF NOT EXISTS idx_entries_completion_date ON entries(completion_date);
CREATE INDEX IF NOT EXISTS idx_entries_resolution ON entries(resolution);
CREATE INDEX IF NOT EXISTS idx_entries_entry_date ON entries(entry_date);
