import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { settleTask, type Db } from "./db.js";
import { ensureRepo } from "./repos.js";
import { takeStep } from "./step.js";
import { createWorktree, removeWorktree } from "./worktree.js";

// The task arrives already claimed, so every path out of here has to settle it.
// Anything that escapes leaves the task `running` with nothing to pick it up
// again: claimNextTask only ever claims `queued`.
export async function runTask(
  db: Db,
  task: { taskId: string; repo: string; description: string },
): Promise<void> {
  // Set as each one succeeds, so the finally knows what there is to clean up.
  let parent: string | undefined;
  let worktree: { repo: string; path: string; branch: string } | undefined;

  try {
    const repo = ensureRepo(task.repo);

    parent = await mkdtemp(join(tmpdir(), "dispatch-"));
    const cwd = join(parent, "worktree");
    const branch = `dispatch-${parent.split("-").at(-1)}`;

    createWorktree({ repo, path: cwd, branch, startPoint: "origin/HEAD" });
    worktree = { repo, path: cwd, branch };

    const { output } = await takeStep(db, {
      taskId: task.taskId,
      prompt: task.description,
      cwd,
      repo: task.repo,
      branch,
      // Absent unless the prompt asked for a pull request: runTask does not
      // know what role the step is playing.
      outputSchema: z.object({
        summary: z.string(),
        prUrl: z.url().optional(),
      }),
    });

    await settleTask(db, task.taskId, "review");

    if (output.prUrl !== undefined) console.log(output.prUrl);
    console.log(output.summary);
  } catch (error) {
    await settleTask(db, task.taskId, "failed");
    throw error;
  } finally {
    // Only undo what was actually created: git refuses to remove a worktree
    // that never got added, and that error would mask the real one.
    if (worktree !== undefined) removeWorktree(worktree);
    if (parent !== undefined) await rm(parent, { recursive: true });
  }
}
