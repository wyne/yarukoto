-- A household: people, the devices they sign in on, and who owns what.
--
-- Until now the server had one credential (YARUKOTO_TOKEN) and one person. The
-- env token keeps working, as the household's owner, so every existing install
-- and every client already connected carries on unchanged: all existing data is
-- backfilled as the owner's, and nothing starts out shared.
--
-- Visibility, which `src/access.ts` is the one authority over:
--   - a list is seen by its owner, and by everyone once it is shared;
--   - a task is seen when its list is, and an Inbox task (no list) only by its owner;
--   - folders, view preferences and saved filters are their owner's alone.
--
-- People are never hard-deleted. Removing one sets `deleted_at` and revokes
-- their devices; their rows stay exactly as they were, hidden, so restoring the
-- person brings every list and task back.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- 'admin' may invite, remove and restore people and connect integrations.
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

-- The owner the env token signs in as. A fixed id, so the backfill below and
-- the auth code agree on it without a lookup.
INSERT INTO users (id, name, role, created_at) VALUES ('u-owner', 'Owner', 'admin', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- One row per signed-in device. `user_id` NULL is a household integration such
-- as Home Assistant: it belongs to nobody and sees only shared lists.
-- Tokens are stored as SHA-256 hashes; the plain token exists only in the
-- response that hands it to the device.
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'app',
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);

-- Sign-in by approval, the "device authorization" pattern TVs use: a device
-- with no token asks for a short code, shows it, and polls with a secret only
-- it holds; a signed-in phone approves the code. `token` holds the issued
-- credential only between approval and the poll that claims it, when the row
-- is deleted.
CREATE TABLE pairings (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  user_id TEXT,
  token TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

ALTER TABLE lists ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'u-owner';
ALTER TABLE lists ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;
ALTER TABLE folders ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'u-owner';
-- NULL for a task created by an integration directly into a shared list.
ALTER TABLE tasks ADD COLUMN owner_id TEXT DEFAULT 'u-owner';
ALTER TABLE tasks ADD COLUMN assignee_id TEXT;
ALTER TABLE saved_filters ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'u-owner';

CREATE INDEX idx_lists_owner ON lists (owner_id);
CREATE INDEX idx_tasks_list ON tasks (list_id);

-- View preferences are keyed by view ('today', 'inbox:list:l_home'), which two
-- people would share, so the key becomes (owner, view). Rebuilt rather than
-- altered because SQLite cannot change a primary key.
--
-- It also gains `server_updated_at`. Pulls compared `updated_at` — the client's
-- clock — against the server's cursor, the bug 002_server_cursor.sql fixed for
-- every other table; a household adds more clocks to disagree.
CREATE TABLE view_prefs_new (
  owner_id TEXT NOT NULL DEFAULT 'u-owner',
  id TEXT NOT NULL,
  group_by TEXT NOT NULL DEFAULT 'none',
  sort_by TEXT NOT NULL DEFAULT 'manual',
  arrangements TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  server_updated_at TEXT,
  PRIMARY KEY (owner_id, id)
);
INSERT INTO view_prefs_new (owner_id, id, group_by, sort_by, arrangements, updated_at, deleted_at, server_updated_at)
  SELECT 'u-owner', id, group_by, sort_by, arrangements, updated_at, deleted_at, updated_at FROM view_prefs;
DROP TABLE view_prefs;
ALTER TABLE view_prefs_new RENAME TO view_prefs;
CREATE INDEX idx_view_prefs_server_updated_at ON view_prefs (server_updated_at);
