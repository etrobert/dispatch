import { type Db } from "../db.js";
import { claimTask } from "../tasks/index.js";
import { runTask } from "../tasks/index.js";

export async function start(db: Db, args: string[]): Promise<void> {
  const [taskId] = args;

  if (taskId === undefined) {
    console.error("usage: dispatch start <task-id>");
    process.exit(1);
  }

  const task = await claimTask(db, taskId);

  if (task === undefined) {
    console.error(`no queued task ${taskId}`);
    process.exit(1);
  }

  await runTask(db, task);
}
