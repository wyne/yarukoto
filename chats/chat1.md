# Self-hosted todo app design

_Started 2026-08-02 01:50 UTC_

---

## User

i’m thinking of creating a TickTick alternative that is just the basics of the todo app but is self hostable. can you help me design a todo app that supports multiple lists, tags, priorities, and scheduling. i want it to work on web and mobile

## Assistant

I'll explore the design system first, then ask a few questions.

_[tool: list_files]_

The attached design system project is empty, so I'll need direction from you on a couple of things. Quick round of questions:

_[tool: questions_v2]_

## User

Questions answered:
- platform_priority: Mobile (desktop follows)
- deliverable: Explore a few options
- primary_view: Inbox (unsorted capture)
- scheduling_depth: Due date + time, Reminders/notifications, Calendar view of scheduled tasks
- hierarchy: Notes/description per task, Subtasks / checklists
- priority_model: 4 levels like TickTick (none/low/med/high)
- organization: Folders containing lists + flat tags
- density: Dense and information-rich (power user)
- quick_add: Inline row at top of list, typed natural language ("pay rent fri #home !high")
- interactions: Checking off a task (animation/feedback), Drag to reorder, Swipe gestures on mobile, Keyboard shortcuts / command palette, Multi-select + bulk edit
- self_host_ui: Yes — including a first-run setup screen
- variations: No variations, one strong direction
- tone: Neutral and utilitarian — gets out of the way

## Assistant

_[tool: read_skill_prompt]_

_[tool: copy_starter_component]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

Six mobile screens are out for review — Inbox with natural-language quick add and swipe actions, task detail, Browse (folders/lists/tags + sync status), Calendar, multi-select bulk edit, and first-run server setup. Accent color is tweakable via the Tweaks panel.

Note: the design system attached to the project is empty, so I set the direction myself — dense, utilitarian, IBM Plex. Next step when you're ready: the desktop web layout on the same system.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

Fixed: all six screens now clear the status bar/dynamic island, and the malformed SVG tag is closed. Out for review again.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

Bottom safe-area padding added — tab bars and the setup footer now clear the home indicator.

## User

<!-- The user explicitly selected the following skills for this project, as attachments to their message. These are not optional context — they define how you work. Use them. -->
<attached-skill name="Design System (design system)">
[Design System] This project uses the **Design System** design system. This is a binding choice for visual style — every visual must follow it. Don't invent colors, type, spacing, or components not grounded here.

Scope: the design system is a visual style reference only. Its guide may describe example products, brands, or people that are unrelated to the user and unrelated to the subject of this conversation. Never treat anything in the design system as a fact about the user, their work, or the topic they asked about.

    Explore it to find what you need:
    - Always copy out the fonts and colors you need
    - For prototypes and designs, always copy out any relevant components
    - If the design system contains existing mocks of products, and you were asked to design or prototype something similar, copy and fork those mocks to start your design. This helps you make high-quality designs.

    Explore it quickly to find relevant UI kits (e.g. mocks of existing products you can copy and fork)

Full system at `/projects/77a7b22f-8f34-400c-b86e-b2a272a04d75/`. Before producing any visuals, explore it: call `list_files("/projects/77a7b22f-8f34-400c-b86e-b2a272a04d75/")` to see the structure, then `read_file` the README/base.md or whatever index file it has. Don't guess at the design system's contents.

CSS tokens: the guide may describe tokens in prose, but the exact `--*` names are defined in the design system's stylesheet(s). Before writing any `var(--*)`, look up the real name in the design system's `.css` files (`list_files` + `read_file` under `/projects/77a7b22f-8f34-400c-b86e-b2a272a04d75/`). Never guess a token name — an unresolved `var()` silently falls back to the browser default.

For assets and UI kits beyond the guide: `read_file("/projects/77a7b22f-8f34-400c-b86e-b2a272a04d75/<path>")` and `copy_files` to bring them into the current project.
</attached-skill>

## Assistant



