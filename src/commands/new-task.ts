import { createTask, openDb } from "../db.js";

export async function newTask(args: string[]): Promise<void> {
  const [description] = args;

  if (description === undefined) {
    console.error("usage: dispatch new-task <description>");
    process.exit(1);
  }

  console.log(await createTask(openDb(), description));
}
