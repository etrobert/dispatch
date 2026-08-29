import { newTask } from "./commands/new-task.js";
import { run } from "./commands/run.js";
import { openDb, queuedTasks } from "./db.js";

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "new-task":
    await newTask(rest);
    break;

  case "run":
    await run(rest);
    break;

  case "tasks":
    for (const task of await queuedTasks(openDb())) {
      console.log(`${task.state}\t${task.taskId}\t${task.description}`);
    }
    break;

  default:
    console.error(
      "usage: dispatch new-task <description> | tasks | run <task-id>",
    );
    process.exit(1);
}
