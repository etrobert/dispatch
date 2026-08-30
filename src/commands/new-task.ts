import { createTask, type Db } from "../db.js";
import { repoUrl } from "../repos.js";

export async function newTask(db: Db, args: string[]): Promise<void> {
  const [description, repo] = args;

  if (description === undefined) {
    console.error("usage: dispatch new-task <description> [repo-url]");
    process.exit(1);
  }

  console.log(await createTask(db, repoUrl(repo), description));
}
