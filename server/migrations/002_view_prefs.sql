CREATE TABLE view_prefs (
  id TEXT PRIMARY KEY,
  group_by TEXT NOT NULL DEFAULT 'none',
  sort_by TEXT NOT NULL DEFAULT 'manual',
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_view_prefs_updated_at ON view_prefs(updated_at);
