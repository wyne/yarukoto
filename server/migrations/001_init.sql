CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'none',
  due_date TEXT,
  due_time TEXT,
  list_id TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  subtasks TEXT NOT NULL DEFAULT '[]',
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  order_key REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX idx_lists_updated_at ON lists(updated_at);
CREATE INDEX idx_folders_updated_at ON folders(updated_at);

CREATE TABLE task_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  op TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX idx_task_revisions_task_id ON task_revisions(task_id, id DESC);
