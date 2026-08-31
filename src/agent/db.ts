import { eq } from "drizzle-orm";
// The connection is shared for now. Extracted, the service would open its own:
// this is the one import here that reaches outside the folder.
import { type Db } from "../db.js";
import { runs, toolFailures } from "./schema.js";
import { type Workspace } from "./runner.js";

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

// Recorded as each failure arrives rather than at the end, so a run that dies
// does not take the list with it.
export async function recordToolFailure(
  db: Db,
  runId: string,
  failure: { toolName: string; error: string; durationMs: number | null },
): Promise<void> {
  await db.insert(toolFailures).values({ runId, ...failure });
}

// What a run was given to work in. Callers that need to send another agent at
// the same place ask for this rather than reading the table themselves.
export async function runWorkspace(
  db: Db,
  runId: string,
): Promise<Workspace | undefined> {
  const [run] = await db
    .select({ repo: runs.repo, branch: runs.branch })
    .from(runs)
    .where(eq(runs.runId, runId));

  return run;
}
