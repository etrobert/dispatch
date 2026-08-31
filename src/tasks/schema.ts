import { type AnyPgColumn, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const tasks = pgTable("tasks", {
  taskId: text("task_id").primaryKey(),
  repo: text("repo").notNull(),
  description: text("description").notNull(),
  // A task has no state of its own: it is computed from its steps. This is only
  // the claim marker — null means no dispatcher has taken the task yet.
  startedAt: timestamp("started_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
