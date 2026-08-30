# CLAUDE.md

## Vocabulary

- **task** — the feature description. What we want done, from a file, GitHub
  issue, Linear ticket, or the UI. Durable identity, either done or not.
- **session** — a Claude Code conversation with one role. Resumable, has memory,
  identified by the UUID dispatch assigns before the process starts.
- **step** — one agent invocation. Has a status, cost, duration, and outcome.
- **role** — `planner` | `implementer` | `reviewer` | `...`. A property of the
  session.

Steps form a tree. `parent_step_id` links a step to the one it branched from: a
review follow-up, a retry, or one of several attempts at the same idea. Depth is
what "round" would have meant; there is no round column.

Tables are `tasks`, `steps`, `tool_failures`. There is no sessions table —
`session_id` is a column on `steps`, deliberately not unique, because a resumed
session spans several steps.

A task has no state column. Its state is computed from its steps: queued until
claimed, running while any step is `running` or `review`, done once none are.
`tasks.started_at` is only the claim marker.

Step status is `running | review | done | closed | failed`. `review` means the
step opened a pull request and waits on a human; the serve loop settles it to
`done` when that request merges, `closed` when it is closed.
