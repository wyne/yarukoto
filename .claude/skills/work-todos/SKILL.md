---
name: work-todos
description: Work through Yarukoto to-do items Justin has tagged claude-todo in his Yarukoto list, leaving draft PRs and notes for him to review. Use for the nightly routine or when asked to work the to-do list.
---

# Work the to-do list

Justin keeps development to-dos in the **Yarukoto** list on his own Yarukoto server, reached
through the `yarukoto` MCP server (`list_lists`, `list_tasks`, `get_task`, `update_task`). This
skill takes items he has opted in, does as much as it can on each, and leaves the result where he
will see it: in the task's notes in the app, and as a draft PR.

Runs unattended (nightly around 1am Eastern) or on demand. Nobody is watching, so never stop to
ask a question: write it into the task and move on.

## Tags are the state

Only ever touch tasks in the Yarukoto list. Find it with `list_lists` by name; don't hard-code
the id.

| Tag | Meaning | Set by |
|---|---|---|
| `claude-todo` | Opted in, not started | Justin |
| `claude-working` | A run has it | this skill |
| `claude-review` | Waiting on Justin; notes say what for | this skill |
| `claude-go` | Justin replied; pick it back up | Justin |

A task with none of these is not yours, however obvious it looks.

`update_task` replaces `tags` and `notes` wholesale. Always `get_task` first, then write back the
full tag list with only your tag swapped, and the full notes with your text **appended**. Never
remove or rewrite anything Justin wrote.

## Each run

At most **3 items** per run, one at a time. In this order:

1. Tasks tagged `claude-go`: read Justin's newest note lines (and comments on the item's PR) and
   continue from there.
2. Tasks tagged `claude-working` whose last `[claude …]` note is more than 6 hours old: a run
   that was cut off. Resume from the branch and the notes.
3. Tasks tagged `claude-todo`, highest priority first (high, medium, low, none), then in the
   order `list_tasks` returns them.

If nothing qualifies, stop without writing anything.

## One item

1. **Claim it** before any other work: swap its tag for `claude-working` and append
   `[claude YYYY-MM-DD HH:MM] Started.` to the notes.
2. **Work in a worktree** so Justin's own checkout is never touched:
   `git fetch origin main && git worktree add ../yarukoto-todo-<short-id> -B claude/todo-<short-id> origin/main`
   (reuse the existing branch when resuming). `<short-id>` is the first 8 characters of the
   task id after its prefix.
3. **Size it and do the most that's useful:**
   - Clear and contained: implement it, following `AGENTS.md` and the subdirectory `AGENTS.md`
     files, and run the checks for what you touched (`npm run typecheck` and `npm test` in
     `client/`, `npm test` in `server/`).
   - Big or ambiguous: write the plan and open questions into the notes; change no code, or
     only the safe first slice.
   - Not code (research, a decision): put the findings in the notes.
4. **Checkpoint as you go.** Commit and push the branch at each working step, and append a
   one-line progress note to the task. If the run is cut off, the branch and notes are all the
   next run has.
5. **Hand it over:**
   - If there is code, open a **draft** PR against `main` with `gh pr create --draft` (Before
     and After paragraphs, then a short How). Link the task title in the body.
   - Swap the tag to `claude-review` and append a short summary, the PR link, and the one
     thing you need from Justin. Ask questions here, as plain lines in the notes, because that
     is where he will reply.
6. Remove the worktree (`git worktree remove`), keeping the branch.

Never merge, never push to `main`, never complete or delete a task. Justin checks items off.

## Running out

Usage can run out mid-item. Assume it will: claim before working, commit early, and keep the
notes current, so a cut-off run leaves a `claude-working` task that rule 2 resumes.

When the run ends, finish with a short summary of what each item ended at.
