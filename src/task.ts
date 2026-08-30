import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type Db } from "./db.js";
import { ensureRepo } from "./repos.js";
import { takeStep } from "./step.js";
import { withNewBranch } from "./worktree.js";

// The worktree and its branch are deleted when the step ends, so anything not
// pushed is lost with them. Publishing is the step's own job.
function implementerPrompt(description: string, branch: string): string {
  return [
    description,
    `When the work is done, commit it and push with \`git push -u origin ${branch}\`,` +
      " then open a pull request with `gh pr create`. Report its url as" +
      " `prUrl`. If there is nothing to push, say so in your summary rather" +
      " than leaving the work only in the worktree.",
  ].join("\n\n");
}

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
      prompt: implementerPrompt(task.description, branch),
      cwd,
      repo: task.repo,
      branch,
      // Still optional: a task that turns out to need no change has nothing to
      // open a pull request for.
      outputSchema: z.object({
        summary: z.string(),
        prUrl: z.url().optional(),
      }),
    }),
  );

  if (output.prUrl !== undefined) console.log(output.prUrl);
  console.log(output.summary);
}
