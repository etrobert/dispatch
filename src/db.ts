import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
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

  await db.insert(tasks).values({ taskId, repo, description });

  return taskId;
}

// Nothing stores a task's state, so it is read back off its steps: queued until
// a dispatcher claims it, running while any step still is, done once nothing is
// in flight.
export async function listTasks(db: Db) {
  const rows = await db
    .select({
      taskId: tasks.taskId,
      description: tasks.description,
      startedAt: tasks.startedAt,
      inFlight: count(steps.stepId),
    })
    .from(tasks)
    .leftJoin(
      steps,
      and(
        eq(steps.taskId, tasks.taskId),
        inArray(steps.status, ["running", "review"]),
      ),
    )
    .groupBy(tasks.taskId, tasks.description, tasks.startedAt, tasks.createdAt)
    .orderBy(tasks.createdAt);

  return rows.map(({ taskId, description, startedAt, inFlight }) => ({
    taskId,
    description,
    state:
      startedAt === null
        ? "queued"
        : inFlight > 0
          ? "running"
          : ("done" as const),
  }));
}

// Conditional update rather than read-then-write, so two dispatchers racing for
// the same task cannot both win it.
export async function claimTask(db: Db, taskId: string) {
  const [task] = await db
    .update(tasks)
    .set({ startedAt: new Date() })
    .where(and(eq(tasks.taskId, taskId), isNull(tasks.startedAt)))
    .returning();

  return task;
}

// SKIP LOCKED is what lets several dispatchers poll the same queue without
// blocking on each other or handing out the same task twice.
export async function claimNextTask(db: Db) {
  const next = db
    .select({ taskId: tasks.taskId })
    .from(tasks)
    .where(isNull(tasks.startedAt))
    .orderBy(tasks.createdAt)
    .limit(1)
    .for("update", { skipLocked: true });

  const [task] = await db
    .update(tasks)
    .set({ startedAt: new Date() })
    .where(inArray(tasks.taskId, next))
    .returning();

  return task;
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
      // A step that opened a pull request is not finished when the agent stops:
      // it waits on the human who has to settle that request.
      status: step.prUrl === null ? "done" : "review",
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

// Steps waiting on a human, paired with the pull request they wait on.
export async function reviewSteps(
  db: Db,
): Promise<{ stepId: string; prUrl: string }[]> {
  const rows = await db
    .select({ stepId: steps.stepId, prUrl: steps.prUrl })
    .from(steps)
    .where(eq(steps.status, "review"));

  return rows.flatMap(({ stepId, prUrl }) =>
    prUrl === null ? [] : [{ stepId, prUrl }],
  );
}

// finished_at stays as the agent left it: the human settling the pull request
// days later is not when the step ran.
export async function settleStep(
  db: Db,
  stepId: string,
  status: "done" | "closed",
): Promise<void> {
  await db.update(steps).set({ status }).where(eq(steps.stepId, stepId));
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
