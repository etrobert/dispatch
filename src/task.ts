import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { MODEL, runStep } from "./claude.js";
import {
  failStep,
  finishStep,
  recordToolFailure,
  settleTask,
  startStep,
  type Db,
} from "./db.js";
import { ensureRepo } from "./repos.js";
import { createWorktree, removeWorktree } from "./worktree.js";

// The task arrives already claimed, so every path out of here has to settle it.
// Anything that escapes leaves the task `running` with nothing to pick it up
// again: claimNextTask only ever claims `queued`.
export async function runTask(
  db: Db,
  task: { taskId: string; repo: string; description: string },
): Promise<void> {
  const stepId = randomUUID();
  const sessionId = randomUUID();

  // Set as each one succeeds, so the catch knows whether there is a step row to
  // fail and the finally knows what there is to clean up.
  let stepStarted = false;
  let parent: string | undefined;
  let worktree: { repo: string; path: string; branch: string } | undefined;

  try {
    const repo = ensureRepo(task.repo);

    parent = await mkdtemp(join(tmpdir(), "dispatch-"));
    const cwd = join(parent, "worktree");
    const branch = `dispatch-${parent.split("-").at(-1)}`;

    createWorktree({ repo, path: cwd, branch, startPoint: "origin/HEAD" });
    worktree = { repo, path: cwd, branch };

    await startStep(db, {
      stepId,
      taskId: task.taskId,
      sessionId,
      prompt: task.description,
      repo: task.repo,
      branch,
      model: MODEL,
    });
    stepStarted = true;

    const { costUsd, turns, durationMs, output } = await runStep({
      sessionId,
      prompt: task.description,
      cwd,
      outputSchema: z.object({ summary: z.string() }),
      onToolFailure: (failure) =>
        recordToolFailure(db, stepId, {
          toolName: failure.tool_name,
          error: failure.error,
          durationMs: failure.duration_ms ?? null,
        }),
    });

    await finishStep(db, { stepId, output, costUsd, turns, durationMs });
    await settleTask(db, task.taskId, "done");

    console.log(`step ${stepId} · $${costUsd.toFixed(4)} · ${turns} turns`);
    console.log(output.summary);
  } catch (error) {
    // Setting up the worktree fails before there is a step row to fail, and the
    // task still has to settle.
    if (stepStarted) await failStep(db, { stepId, error: String(error) });
    await settleTask(db, task.taskId, "failed");
    throw error;
  } finally {
    // Only undo what was actually created: git refuses to remove a worktree
    // that never got added, and that error would mask the real one.
    if (worktree !== undefined) removeWorktree(worktree);
    if (parent !== undefined) await rm(parent, { recursive: true });
  }
}
