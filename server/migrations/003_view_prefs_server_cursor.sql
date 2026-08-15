-- view_prefs never got the fix 002_server_cursor.sql applied to tasks/lists/folders:
-- `updated_at` is stamped by the *client*, but the `since` cursor handed back by
-- GET /sync is the *server's* clock. A device whose clock runs behind the server
-- writes a view pref that lands older than a cursor another client already holds,
-- and `updated_at > since` skips it forever.
--
-- Same fix as 002_server_cursor.sql: cursors run off `server_updated_at`, written
-- by the server on every accepted upsert. `updated_at` keeps doing last-write-wins
-- conflict resolution.
--
-- Existing rows are backfilled with `updated_at`: they have already been synced,
-- and every client does a full hydrate on launch regardless.

ALTER TABLE view_prefs ADD COLUMN server_updated_at TEXT;

UPDATE view_prefs SET server_updated_at = updated_at WHERE server_updated_at IS NULL;

CREATE INDEX idx_view_prefs_server_updated_at ON view_prefs(server_updated_at);
