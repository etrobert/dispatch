import { setTimeout } from "node:timers/promises";
import { claimNextTask, type Db } from "../db.js";
import { runTask } from "../task.js";

const POLL_MS = 5000;

export async function serve(db: Db): Promise<void> {
  const stopping = new AbortController();
  process.once("SIGINT", () => stopping.abort());
  process.once("SIGTERM", () => stopping.abort());

  console.log("dispatch serving");

  while (!stopping.signal.aborted) {
    const task = await claimNextTask(db);

    if (task === undefined) {
      await setTimeout(POLL_MS, undefined, { signal: stopping.signal }).catch(
        (error: unknown) => {
          // An aborted sleep is the wake-up. Anything else rejects instantly,
          // which would turn this poll into a busy loop.
          if (!(error instanceof Error) || error.name !== "AbortError")
            throw error;
        },
      );
      continue;
    }

    console.log(`task ${task.taskId}`);

    // One failing task must not end the loop; runTask has already recorded it.
    await runTask(db, task).catch((error: unknown) => {
      console.error(`task ${task.taskId} failed: ${String(error)}`);
    });
  }

  console.log("dispatch stopped");
}
