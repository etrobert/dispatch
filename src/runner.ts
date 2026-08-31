import { randomUUID } from "node:crypto";
import { z } from "zod";
import { runStep } from "./claude.js";
import {
  failRun,
  finishRun,
  recordToolFailure,
  startRun,
  type Db,
} from "./db.js";
import { ensureRepo } from "./repos.js";
import { withBranch } from "./worktree.js";

// Where an agent runs: a repository to clone and the branch the work belongs
// on. Cloning, fetching, the worktree and its removal are all this module's
// business — the caller only names the two.
export type Workspace = { repo: string; branch: string };

// Run one agent in a worktree of its own, recorded from start to finish. Knows
// nothing about tasks, steps or pull requests: `runs` and `tool_failures` are
// the only tables it touches, so it could be lifted out with them.
//
// The caller supplies the id so its own row can point at this one before the
// agent exists.
export async function runAgent<Schema extends z.ZodType>(
  db: Db,
  run: {
    runId: string;
    workspace: Workspace;
    prompt: string;
    model: string;
    outputSchema: Schema;
  },
): Promise<{
  costUsd: number;
  turns: number;
  durationMs: number;
  output: z.infer<Schema>;
}> {
  const sessionId = randomUUID();

  await startRun(db, {
    runId: run.runId,
    sessionId,
    prompt: run.prompt,
    repo: run.workspace.repo,
    branch: run.workspace.branch,
    model: run.model,
  });

  // Everything past here has a row to fail, which is why the insert sits
  // outside the try. Cloning and the worktree are inside it, so failing to
  // build one is recorded rather than escaping.
  try {
    const result = await withBranch(
      ensureRepo(run.workspace.repo),
      run.workspace.branch,
      (cwd) =>
        runStep({
          sessionId,
          prompt: run.prompt,
          cwd,
          model: run.model,
          outputSchema: run.outputSchema,
          onToolFailure: (failure) =>
            recordToolFailure(db, run.runId, {
              toolName: failure.tool_name,
              error: failure.error,
              durationMs: failure.duration_ms ?? null,
            }),
        }),
    );

    await finishRun(db, { runId: run.runId, ...result });

    return result;
  } catch (error) {
    await failRun(db, { runId: run.runId, error: String(error) });
    throw error;
  }
}
