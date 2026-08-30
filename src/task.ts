import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type Db } from "./db.js";
import { ensureRepo } from "./repos.js";
import { takeStep } from "./step.js";
import { withNewBranch } from "./worktree.js";

// The task arrives already claimed. Errors propagate: takeStep has already
// recorded them on the step, and serve logs what escapes.
export async function runTask(
  db: Db,
  task: { taskId: string; repo: string; description: string },
): Promise<void> {
  const repo = ensureRepo(task.repo);
  const branch = `dispatch-${randomUUID().slice(0, 6)}`;

  const { output } = await withNewBranch(repo, branch, (cwd) =>
    takeStep(db, {
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
    }),
  );

  if (output.prUrl !== undefined) console.log(output.prUrl);
  console.log(output.summary);
}
