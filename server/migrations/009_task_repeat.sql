-- Repeating tasks (see packages/domain/src/recurrence.ts).
--
-- JSON `{ "rule": "FREQ=…", "from": "due" | "completion" }`, or NULL for a task
-- that doesn't repeat. Like `assignee_id`, a push that leaves the field out keeps
-- what is stored, so an app build from before repeats can't stop a series.

ALTER TABLE tasks ADD COLUMN repeat TEXT;
