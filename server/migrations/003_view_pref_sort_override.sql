-- A view can now be reordered by hand while a sort is active.
--
-- The drag wins rather than the sort: the view remembers that its order was
-- customised, renders by the manual `order_key`, and offers to restore the sort.
-- Dropping a row somewhere never rewrites the task's own fields, so a reorder
-- can't quietly change a priority or a due date.
--
-- Existing rows default to 0 — no view has been overridden before this migration.

ALTER TABLE view_prefs ADD COLUMN sort_overridden INTEGER NOT NULL DEFAULT 0;
