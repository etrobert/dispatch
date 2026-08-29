# CLAUDE.md

## Vocabulary

- **task** — the feature description. What we want done, from a file, GitHub
  issue, Linear ticket, or the UI. Durable identity, either done or not.
- **session** — a Claude Code conversation with one role. Resumable, has memory,
  identified by the UUID dispatch assigns before the process starts.
- **step** — one agent invocation. Has a status, cost, duration, and outcome.
- **round** — an integer on a step: which pass of the loop it belongs to. The
  planner is round 0.
- **role** — `planner` | `implementer` | `reviewer` | `...`. A property of the
  session.

Tables are `tasks`, `sessions`, `steps`. One task has several sessions; one
session has one step per round when resumed, or exactly one when each step
spawns a fresh session — that choice is still open and the schema stays neutral
on it.

Don't use **run**: it ambiguously meant a task's whole execution, a single step,
and a session.
