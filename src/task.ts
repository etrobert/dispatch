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

export async function runTask(
  db: Db,
  task: { taskId: string; repo: string; description: string },
): Promise<void> {
  const repo = ensureRepo(task.repo);

  const stepId = randomUUID();
  const sessionId = randomUUID();
  const parent = await mkdtemp(join(tmpdir(), "dispatch-"));
  const cwd = join(parent, "worktree");
  const branch = `dispatch-${parent.split("-").at(-1)}`;

  createWorktree({ repo, path: cwd, branch, startPoint: "origin/HEAD" });
  await startStep(db, {
    stepId,
    taskId: task.taskId,
    sessionId,
    prompt: task.description,
    repo: task.repo,
    branch,
    model: MODEL,
  });

  try {
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
    await failStep(db, { stepId, error: String(error) });
    await settleTask(db, task.taskId, "failed");
    throw error;
  } finally {
    removeWorktree({ repo, path: cwd, branch });
    await rm(parent, { recursive: true });
  }
}
