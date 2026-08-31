import {
  type AnyPgColumn,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const tasks = pgTable("tasks", {
  taskId: text("task_id").primaryKey(),
  repo: text("repo").notNull(),
  description: text("description").notNull(),
  // A task has no state of its own: it is computed from its steps. This is only
  // the claim marker — null means no dispatcher has taken the task yet.
  startedAt: timestamp("started_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One agent execution. Nothing here refers to a task, a step or a pull request:
// this is the whole of what the agent service needs, and with tool_failures the
// only table it writes.
export const runs = pgTable("runs", {
  runId: text("run_id").primaryKey(),
  // Not unique: a resumed session spans several runs.
  sessionId: text("session_id").notNull(),
  prompt: text("prompt").notNull(),
  // The workspace the run was given: a repository url and the branch its work
  // belongs on.
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  model: text("model").notNull(),
  // running | done | failed. What the agent did, not what it was for.
  status: text("status").notNull(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  // Unknown until the run finishes.
  output: jsonb("output"),
  error: text("error"),
  costUsd: real("cost_usd"),
  turns: integer("turns"),
  durationMs: integer("duration_ms"),
  finishedAt: timestamp("finished_at"),
});

// The columns after started_at are the ones unknown until the step finishes.
// session_id is deliberately not unique: a resumed session spans several steps.
export const steps = pgTable("steps", {
  stepId: text("step_id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.taskId),
  // Null on a task's first step. Steps form a tree: a child is a review
  // follow-up, a retry, or one of several versions of the same idea.
  parentStepId: text("parent_step_id").references(
    (): AnyPgColumn => steps.stepId,
  ),
  // The pull request comment this step answers. A comment that already has a
  // step against it is never followed up a second time. Null on every step that
  // is not a review follow-up.
  commentId: text("comment_id"),
  // The agent execution behind this step, if there is one — a future node that
  // only asks a human a question has none. Deliberately not a foreign key: runs
  // are meant to be liftable into a service with a database of their own, and
  // nothing here may reference across that line.
  runId: text("run_id"),
  // running | review | done | closed | failed. `review` is a step that opened a
  // pull request and is waiting on a human; it settles when that request does.
  status: text("status").notNull(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  // Extracted from output so the review poller can look a step up by its pull
  // request. One step opens at most one, and only if its prompt asked for it.
  prUrl: text("pr_url"),
  finishedAt: timestamp("finished_at"),
});

// One row per tool call the agent got an error back from, so a step's failures
// can be inspected after it finishes. Only duration_ms is nullable: the hook
// omits it when the call failed before the tool itself ran.
export const toolFailures = pgTable("tool_failures", {
  toolFailureId: uuid("tool_failure_id").primaryKey().defaultRandom(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.runId),
  toolName: text("tool_name").notNull(),
  error: text("error").notNull(),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
