-- Saved filters: a Browse question kept under a name.
--
-- The criteria travel as JSON, like a task's tags and subtasks — the server
-- validates them on the way out (normalizeCriteria) so a client is never handed
-- a shape it cannot read, but it does not otherwise interpret them except to
-- evaluate a filter for GET /api/v1/filters/:id/tasks.
--
-- server_updated_at from the start, for the reason 002_server_cursor.sql gives:
-- pulls compare this server's clock, never a client's.

CREATE TABLE saved_filters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  criteria TEXT NOT NULL DEFAULT '{}',
  order_key REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  server_updated_at TEXT
);

CREATE INDEX idx_saved_filters_server_updated_at ON saved_filters (server_updated_at);
