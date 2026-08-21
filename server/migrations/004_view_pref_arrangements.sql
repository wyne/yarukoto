-- Manual arrangements made while a sort is active.
--
-- Replaces the boolean added in 003. That flag meant "this view abandoned its
-- sort", which forced the arrangement into the task's own `order_key` — the
-- column that *is* the Custom order — so reordering under a priority sort
-- silently rewrote the user's manual arrangement in every other view.
--
-- Keyed `sortBy -> group -> task id -> position`, the arrangement instead lives
-- on the view that owns it. A drag then touches this one row and no task at all,
-- each sort keeps its own arrangement, and Custom order is left alone.
--
-- JSON in TEXT, like tasks.tags and tasks.subtasks.

ALTER TABLE view_prefs ADD COLUMN arrangements TEXT NOT NULL DEFAULT '{}';
ALTER TABLE view_prefs DROP COLUMN sort_overridden;
