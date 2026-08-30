import { reviewSteps, settleStep, type Db } from "./db.js";
import { prState } from "./github.js";

// A step in review ends when its pull request does. Nothing here waits: the
// human takes as long as they take, so the serve loop asks again each poll.
// Steps settle one by one, so a task with several branches open can have one
// finished and another still under review.
export async function settleReviewed(db: Db): Promise<void> {
  for (const { stepId, prUrl } of await reviewSteps(db)) {
    const state = prState(prUrl);

    if (state === "OPEN") continue;

    await settleStep(db, stepId, state === "MERGED" ? "done" : "closed");
    console.log(`step ${stepId} ${state.toLowerCase()}`);
  }
}
