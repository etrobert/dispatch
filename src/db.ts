import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { requireEnv } from "./env.js";
import { steps, tasks, toolFailures } from "./schema.js";

export type Db = ReturnType<typeof drizzle>;

export function openDb(): Db {
  return drizzle(requireEnv("DISPATCH_DATABASE_URL"));
}

// Idempotent: drizzle records in the database which migrations it has applied,
// so the daemon can call this on every start. The folder is installed next to
// the bundle rather than resolvable from it, so its path comes in from the
// environment.
export async function migrateDb(db: Db): Promise<void> {
  console.log("migrating database");
  await migrate(db, { migrationsFolder: requireEnv("DISPATCH_MIGRATIONS") });
  // drizzle's migrate() reports nothing about which migrations it applied, so
  // reaching this line is all there is to say.
  console.log("database schema up to date");
}

export async function createTask(
  db: Db,
  repo: string,
  description: string,
): Promise<string> {
  const taskId = randomUUID();

  await db.insert(tasks).values({ taskId, repo, description, state: "queued" });

  return taskId;
}

export async function queuedTasks(db: Db) {
  return db.select().from(tasks).where(eq(tasks.state, "queued"));
}

// Conditional update rather than read-then-write, so two dispatchers racing for
// the same task cannot both win it.
export async function claimTask(db: Db, taskId: string) {
  const [task] = await db
    .update(tasks)
    .set({ state: "running" })
    .where(and(eq(tasks.taskId, taskId), eq(tasks.state, "queued")))
    .returning();

  return task;
}

// SKIP LOCKED is what lets several dispatchers poll the same queue without
// blocking on each other or handing out the same task twice.
export async function claimNextTask(db: Db) {
  const next = db
    .select({ taskId: tasks.taskId })
    .from(tasks)
    .where(eq(tasks.state, "queued"))
    .orderBy(tasks.createdAt)
    .limit(1)
    .for("update", { skipLocked: true });

  const [task] = await db
    .update(tasks)
    .set({ state: "running" })
    .where(inArray(tasks.taskId, next))
    .returning();

  return task;
}

// `review` is where a successful task stops: it waits for comments on its pull
// request rather than finishing on its own.
export async function settleTask(
  db: Db,
  taskId: string,
  state: "review" | "failed",
): Promise<void> {
  await db.update(tasks).set({ state }).where(eq(tasks.taskId, taskId));
}

export async function startStep(
  db: Db,
  step: {
    stepId: string;
    taskId: string;
    parentStepId?: string;
    sessionId: string;
    prompt: string;
    repo: string;
    branch: string;
    model: string;
  },
): Promise<void> {
  await db.insert(steps).values({ ...step, status: "running" });
}

export async function finishStep(
  db: Db,
  step: {
    stepId: string;
    output: unknown;
    prUrl: string | null;
    costUsd: number;
    turns: number;
    durationMs: number;
  },
): Promise<void> {
  await db
    .update(steps)
    .set({
      status: "done",
      output: step.output,
      prUrl: step.prUrl,
      costUsd: step.costUsd,
      turns: step.turns,
      durationMs: step.durationMs,
      finishedAt: new Date(),
    })
    .where(eq(steps.stepId, step.stepId));
}

export async function failStep(
  db: Db,
  step: { stepId: string; error: string },
): Promise<void> {
  await db
    .update(steps)
    .set({ status: "failed", error: step.error, finishedAt: new Date() })
    .where(eq(steps.stepId, step.stepId));
}

// Written after the step finishes rather than as each failure arrives, so the
// hook stays off the database and the step row it points at already exists.
export async function recordToolFailure(
  db: Db,
  stepId: string,
  failure: { toolName: string; error: string; durationMs: number | null },
): Promise<void> {
  await db.insert(toolFailures).values({ stepId, ...failure });
}
