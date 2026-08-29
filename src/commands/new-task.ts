import { createTask, type Db } from "../db.js";

export async function newTask(db: Db, args: string[]): Promise<void> {
  const [description, repo = process.cwd()] = args;

  if (description === undefined) {
    console.error("usage: dispatch new-task <description> [repo]");
    process.exit(1);
  }

  console.log(await createTask(db, repo, description));
}
