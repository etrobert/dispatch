import { integer, jsonb, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
