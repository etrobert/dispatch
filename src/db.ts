import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { requireEnv } from "./env.js";
import { runs, steps, tasks, toolFailures } from "./schema.js";

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

export async function startRun(
  db: Db,
  run: {
    runId: string;
    sessionId: string;
    prompt: string;
    repo: string;
    branch: string;
    model: string;
  },
): Promise<void> {
  await db.insert(runs).values({ ...run, status: "running" });
}

export async function finishRun(
  db: Db,
  run: {
    runId: string;
    output: unknown;
    costUsd: number;
    turns: number;
    durationMs: number;
  },
): Promise<void> {
  await db
    .update(runs)
    .set({ ...run, status: "done", finishedAt: new Date() })
    .where(eq(runs.runId, run.runId));
}

export async function failRun(
  db: Db,
  run: { runId: string; error: string },
): Promise<void> {
  await db
    .update(runs)
    .set({ status: "failed", error: run.error, finishedAt: new Date() })
    .where(eq(runs.runId, run.runId));
}

export async function startStep(
  db: Db,
  step: {
    stepId: string;
    taskId: string;
    parentStepId?: string;
    commentId?: string;
    runId: string;
  },
): Promise<void> {
  await db.insert(steps).values({ ...step, status: "running" });
}

export async function finishStep(
  db: Db,
  step: { stepId: string; prUrl: string | null },
): Promise<void> {
  await db
    .update(steps)
    .set({
      // A step that opened a pull request is not finished when the agent stops:
      // it waits on the human who has to settle that request.
      status: step.prUrl === null ? "done" : "review",
      prUrl: step.prUrl,
      finishedAt: new Date(),
    })
    .where(eq(steps.stepId, step.stepId));
}

// The reason is on the run that failed; the step only records that it did.
export async function failStep(db: Db, stepId: string): Promise<void> {
  await db
    .update(steps)
    .set({ status: "failed", finishedAt: new Date() })
    .where(eq(steps.stepId, stepId));
}

// Steps waiting on a human, with what a follow-up needs to work on their pull
// request.
export async function reviewSteps(db: Db) {
  const rows = await db
    .select({
      stepId: steps.stepId,
      taskId: steps.taskId,
      prUrl: steps.prUrl,
      repo: runs.repo,
      branch: runs.branch,
    })
    .from(steps)
    .innerJoin(runs, eq(steps.runId, runs.runId))
    .where(eq(steps.status, "review"));

  return rows.flatMap((row) =>
    row.prUrl === null ? [] : [{ ...row, prUrl: row.prUrl }],
  );
}

// The comments this step has already answered, so none is answered twice.
export async function answeredComments(
  db: Db,
  stepId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ commentId: steps.commentId })
    .from(steps)
    .where(eq(steps.parentStepId, stepId));

  return new Set(rows.flatMap((row) => row.commentId ?? []));
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

// Recorded as each failure arrives rather than at the end, so a run that dies
// does not take the list with it.
export async function recordToolFailure(
  db: Db,
  runId: string,
  failure: { toolName: string; error: string; durationMs: number | null },
): Promise<void> {
  await db.insert(toolFailures).values({ runId, ...failure });
}
