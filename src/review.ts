import { z } from "zod";
import { answeredComments, reviewSteps, settleStep, type Db } from "./db.js";
import { listComments, prState, type PrComment } from "./github.js";
import { runWorkspace } from "./agent/index.js";
import { takeStep } from "./step.js";

type ReviewStep = Awaited<ReturnType<typeof reviewSteps>>[number];

function followUpPrompt(comment: PrComment, branch: string): string {
  // Null or absent when the comment is not anchored to a line any more.
  const at =
    comment.line == null ? comment.path : `${comment.path}:${comment.line}`;

  return [
    `Address this review comment, left on ${at} of the pull request you are working on.`,
    comment.body,
    // The agents answering this pull request's other comments are running right
    // now against the same branch, so whoever pushes second has to catch up.
    `Then commit and push with \`git push origin HEAD:${branch}\`. If that is` +
      " rejected, another agent pushed first: `git pull --rebase`, then push" +
      " again.",
  ].join("\n\n");
}

// One child step per comment, all at once.
async function followUp(db: Db, step: ReviewStep): Promise<void> {
  const answered = await answeredComments(db, step.stepId);
  const fresh = listComments(step.prUrl).filter(
    (comment) => !answered.has(String(comment.id)),
  );

  if (fresh.length === 0) return;

  const workspace = await runWorkspace(db, step.runId);

  if (workspace === undefined) throw new Error(`no run ${step.runId}`);

  console.log(`step ${step.stepId} · ${fresh.length} comment(s) to answer`);

  await Promise.all(
    fresh.map((comment) =>
      takeStep(db, {
        taskId: step.taskId,
        parentStepId: step.stepId,
        commentId: String(comment.id),
        prompt: followUpPrompt(comment, workspace.branch),
        workspace,
        // No prUrl: a follow-up pushes to the pull request its parent opened,
        // so it finishes rather than waiting on a review of its own.
        outputSchema: z.object({ summary: z.string() }),
      }),
    ),
  );
}

// A step in review ends when its pull request does; while that stays open, new
// comments on it dispatch follow-ups. Nothing here waits: the human takes as
// long as they take, so the serve loop asks again each poll. Steps settle one
// by one, so a task with several branches open can have one finished and
// another still under review.
export async function pollReviews(db: Db): Promise<void> {
  for (const step of await reviewSteps(db)) {
    const state = prState(step.prUrl);

    if (state !== "OPEN") {
      await settleStep(db, step.stepId, state === "MERGED" ? "done" : "closed");
      console.log(`step ${step.stepId} ${state.toLowerCase()}`);
      continue;
    }

    await followUp(db, step);
  }
}
