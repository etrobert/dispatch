# CLAUDE.md

## Vocabulary

- **task** — the feature description. What we want done, from a file, GitHub
  issue, Linear ticket, or the UI. Durable identity, either done or not.
- **session** — a Claude Code conversation with one role. Resumable, has memory,
  identified by the UUID dispatch assigns before the process starts.
- **step** — a node in the task's graph. Records what it was for and how it
  settled, not how it was carried out.
- **run** — one agent execution. Has a status, cost, duration and outcome. A
  step has at most one; a node that only waits on a human has none.
- **role** — `planner` | `implementer` | `reviewer` | `...`. A property of the
  session.

Steps form a tree. `parent_step_id` links a step to the one it branched from: a
review follow-up, a retry, or one of several attempts at the same idea. Depth is
what "round" would have meant; there is no round column.

Tables are `tasks`, `steps`, `runs`, `tool_failures`. There is no sessions table
— `session_id` is a column on `runs`, deliberately not unique, because a resumed
session spans several runs.

`runs` and `tool_failures` are the agent service: given a repository url, a
branch and a prompt, it clones, builds a worktree, runs the agent and records
what that cost. Nothing in them names a task, a step or a pull request, so they
could be lifted into a separate service. Everything that knows what the work is
_for_ — the graph, pull requests, review — lives in `tasks` and `steps`.

A task has no state column. Its state is computed from its steps: queued until
claimed, running while any step is `running` or `review`, done once none are.
`tasks.started_at` is only the claim marker.

Step status is `running | review | done | closed | failed`. `review` means the
step opened a pull request and waits on a human; the serve loop settles it to
`done` when that request merges, `closed` when it is closed. Run status is
`running | done | failed` — the agent knows nothing of review.

**run** means one agent execution and nothing else: not a task's whole
execution, and not a session, which can span several runs. The command that
starts a single task is `dispatch start` rather than `run`, to keep it that way.
