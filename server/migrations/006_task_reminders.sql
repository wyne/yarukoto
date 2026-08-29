-- Relative reminder rules for tasks.
--
-- Stored as JSON like tags and subtasks. The client interprets these as local
-- clock times relative to due_date; the server only preserves and revisions the
-- rules.

ALTER TABLE tasks ADD COLUMN reminders TEXT NOT NULL DEFAULT '[]';
