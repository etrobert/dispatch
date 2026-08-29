import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { steps, tasks } from "./schema.js";

export type Db = ReturnType<typeof drizzle>;

export function openDb(): Db {
  const url = process.env["DATABASE_URL"];

  if (url === undefined) {
    throw new Error("DATABASE_URL must point at a postgres database");
  }

  return drizzle(url);
}

export async function createTask(db: Db, description: string): Promise<string> {
  const taskId = randomUUID();

  await db.insert(tasks).values({ taskId, description, state: "queued" });

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

export async function settleTask(
  db: Db,
  taskId: string,
  state: "done" | "failed",
): Promise<void> {
  await db.update(tasks).set({ state }).where(eq(tasks.taskId, taskId));
}

export async function startStep(
  db: Db,
  step: {
    stepId: string;
    taskId: string;
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
