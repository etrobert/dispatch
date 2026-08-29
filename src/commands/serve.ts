import { setTimeout } from "node:timers/promises";
import {
  claimNextTask,
  type Db,
  migrateDb,
  sweepStrandedTasks,
} from "../db.js";
import { runTask } from "../task.js";

const POLL_MS = 5000;

export async function serve(db: Db): Promise<void> {
  // A freshly deployed machine has an empty database, and nothing else applies
  // the schema to it.
  await migrateDb(db);

  // Tasks a previous process left `running` have nothing to settle them, so
  // this daemon does it before taking anything new on.
  for (const taskId of await sweepStrandedTasks(db)) {
    console.log(`task ${taskId} stranded by a previous process, failed`);
  }

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
