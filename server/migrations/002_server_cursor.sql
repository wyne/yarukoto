-- Sync cursors must not depend on client clocks.
--
-- `updated_at` is stamped by the *client* that made the edit, but the `since`
-- cursor handed back by GET /sync is the *server's* clock. When those clocks
-- disagree — which they always do across a network — a record written by a
-- client running behind the server lands with an `updated_at` older than the
-- cursor another client is already holding, and `updated_at > since` skips it
-- forever. The record is on the server, but incremental pulls never return it.
--
-- So cursors now run off `server_updated_at`, written by the server on every
-- accepted upsert. `updated_at` keeps its original job — last-write-wins
-- conflict resolution, which genuinely wants the time of the *edit*, not the
-- time it happened to arrive.
--
-- Existing rows are backfilled with `updated_at`: they have already been synced,
-- and every client does a full hydrate on launch regardless.

ALTER TABLE tasks ADD COLUMN server_updated_at TEXT;
ALTER TABLE lists ADD COLUMN server_updated_at TEXT;
ALTER TABLE folders ADD COLUMN server_updated_at TEXT;

UPDATE tasks SET server_updated_at = updated_at WHERE server_updated_at IS NULL;
UPDATE lists SET server_updated_at = updated_at WHERE server_updated_at IS NULL;
UPDATE folders SET server_updated_at = updated_at WHERE server_updated_at IS NULL;

CREATE INDEX idx_tasks_server_updated_at ON tasks(server_updated_at);
CREATE INDEX idx_lists_server_updated_at ON lists(server_updated_at);
CREATE INDEX idx_folders_server_updated_at ON folders(server_updated_at);
