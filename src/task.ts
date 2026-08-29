import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { MODEL, runStep } from "./claude.js";
import { failStep, finishStep, settleTask, startStep, type Db } from "./db.js";
import { createWorktree, removeWorktree } from "./worktree.js";

export async function runTask(
  db: Db,
  task: { taskId: string; repo: string; description: string },
): Promise<void> {
  const { repo } = task;

  const stepId = randomUUID();
  const sessionId = randomUUID();
  const parent = await mkdtemp(join(tmpdir(), "dispatch-"));
  const cwd = join(parent, "worktree");
  const branch = `dispatch/${parent.split("-").at(-1)}`;

  createWorktree({ repo, path: cwd, branch });
  await startStep(db, {
    stepId,
    taskId: task.taskId,
    sessionId,
    prompt: task.description,
    repo,
    branch,
    model: MODEL,
  });

  try {
    const { costUsd, turns, durationMs, output } = await runStep({
      sessionId,
      prompt: task.description,
      cwd,
      outputSchema: z.object({ summary: z.string() }),
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
  }
}
