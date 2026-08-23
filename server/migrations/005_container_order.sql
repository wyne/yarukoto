-- Manual ordering for folders and lists, and lists that live at the root.
--
-- Until now neither carried a position, so the sidebar rendered them in plain
-- array order — and that array is filled by the sync pull, which returns
-- `ORDER BY server_updated_at`. The client's cursor is session-scoped, so every
-- launch is a full hydrate: the nav came back in least-recently-edited order,
-- and renaming a list silently moved it. This column is what fixes that, and
-- what a drag in the nav writes to.
--
-- `order_key` rather than `order`, matching tasks — `order` is a SQL keyword.
-- REAL for the same reason tasks use it: positions are midpoints between
-- neighbours, so a drag rewrites one row instead of renumbering the column.
--
-- The two changes are one migration because they are one idea: the nav is a
-- single tree whose root holds folders and lists side by side. `folder_id`
-- becoming nullable is what lets a list sit there, and because those rows are
-- siblings of the folders, a root list's `order_key` and a folder's are values
-- in the same space.

ALTER TABLE folders ADD COLUMN order_key REAL NOT NULL DEFAULT 0;

-- SQLite cannot drop a NOT NULL, so `lists` is rebuilt. Everything else about
-- the table is carried over verbatim.
CREATE TABLE lists_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  folder_id TEXT,
  order_key REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  server_updated_at TEXT
);
INSERT INTO lists_new (id, name, color, folder_id, updated_at, deleted_at, server_updated_at)
  SELECT id, name, color, folder_id, updated_at, deleted_at, server_updated_at FROM lists;
DROP TABLE lists;
ALTER TABLE lists_new RENAME TO lists;
CREATE INDEX IF NOT EXISTS idx_lists_server_updated_at ON lists (server_updated_at);

-- Backfill here rather than letting clients normalise the DEFAULT 0 ties on
-- first read: two devices would each run their own "one-time" pass, disagree,
-- and both push a full set of dirty rows. The server does it once, before
-- anyone reads.
--
-- Ordered by name because it is the only field that means anything to the user
-- — `updated_at` is precisely what caused the bug above, and neither table has
-- a `created_at`. "Alphabetical until you drag it" is a defensible starting
-- point. Tie-broken by id so the ordering is total.
--
-- Folders are numbered from 1000 and root lists from 1, so that after an
-- upgrade every folder still sorts above the loose lists rather than the two
-- kinds interleaving by name into an order nobody chose.
UPDATE folders SET order_key = 1000 + (
  SELECT rn FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY name COLLATE NOCASE, id) AS rn FROM folders
  ) s WHERE s.id = folders.id
);

-- Partitioned by folder: a list's order is scoped to its parent, and all the
-- root lists (folder_id IS NULL) form one partition of their own.
UPDATE lists SET order_key = (
  SELECT rn FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY COALESCE(folder_id, '') ORDER BY name COLLATE NOCASE, id
    ) AS rn FROM lists
  ) s WHERE s.id = lists.id
);

-- Note what this deliberately does NOT do: touch `server_updated_at`. Bumping it
-- would push the whole container set at every client holding a cursor, and for
-- the reason 002_server_cursor.sql sets out, it buys nothing here — the next
-- hydrate reads these rows anyway.
