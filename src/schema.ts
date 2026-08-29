import {
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Nullable columns are the ones unknown until the step finishes. session_id is
// deliberately not unique: a resumed session spans several steps.
export const steps = pgTable("steps", {
  stepId: text("step_id").primaryKey(),
  sessionId: text("session_id").notNull(),
  prompt: text("prompt").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  model: text("model").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  output: jsonb("output"),
  error: text("error"),
  costUsd: real("cost_usd"),
  turns: integer("turns"),
  durationMs: integer("duration_ms"),
  finishedAt: timestamp("finished_at"),
});
