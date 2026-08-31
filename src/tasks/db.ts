import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { type Db } from "../db.js";
import { steps, tasks } from "./schema.js";

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

// Steps waiting on a human. Where their work lives is the run's to say, so the
// caller asks the agent service rather than joining its table.
export async function reviewSteps(db: Db) {
  const rows = await db
    .select({
      stepId: steps.stepId,
      taskId: steps.taskId,
      prUrl: steps.prUrl,
      runId: steps.runId,
    })
    .from(steps)
    .where(eq(steps.status, "review"));

  return rows.flatMap((row) =>
    row.prUrl === null || row.runId === null
      ? []
      : [{ ...row, prUrl: row.prUrl, runId: row.runId }],
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
