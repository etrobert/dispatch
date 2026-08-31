import { claimTask, type Db } from "../db.js";
import { runTask } from "../task.js";

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
