import { newTask } from "./commands/new-task.js";
import { start } from "./commands/start.js";
import { serve } from "./commands/serve.js";
import { listTasks, openDb } from "./db.js";

const [command, ...rest] = process.argv.slice(2);
const db = openDb();

switch (command) {
  case "new-task":
    await newTask(db, rest);
    break;

  case "start":
    await start(db, rest);
    break;

  case "serve":
    await serve(db);
    break;

  case "tasks":
    for (const task of await listTasks(db)) {
      console.log(`${task.state}\t${task.taskId}\t${task.description}`);
    }
    break;

  default:
    console.error(
      "usage: dispatch new-task <description> [repo-url] | tasks | start <task-id> | serve",
    );
    process.exit(1);
}

// An idle pool connection keeps the event loop alive for its 10s timeout.
await db.$client.end();
