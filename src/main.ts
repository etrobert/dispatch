import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { MODEL, runStep } from "./claude.js";
import { newTask } from "./commands/new-task.js";
import { failStep, finishStep, openDb, queuedTasks, startStep } from "./db.js";
import { createWorktree, removeWorktree } from "./worktree.js";

const [command, ...rest] = process.argv.slice(2);

if (command === "new-task") {
  await newTask(rest);
  process.exit(0);
}

if (command === "tasks") {
  for (const task of await queuedTasks(openDb())) {
    console.log(`${task.state}\t${task.taskId}\t${task.description}`);
  }

  process.exit(0);
}

const [prompt, repo = process.cwd()] = [command, ...rest];

if (prompt === undefined) {
  console.error("usage: dispatch <prompt> [repo]");
  process.exit(1);
}

const stepId = randomUUID();
const sessionId = randomUUID();
const parent = await mkdtemp(join(tmpdir(), "dispatch-"));
const cwd = join(parent, "worktree");
const branch = `dispatch/${parent.split("-").at(-1)}`;

const db = openDb();

createWorktree({ repo, path: cwd, branch });
await startStep(db, { stepId, sessionId, prompt, repo, branch, model: MODEL });

try {
  const { costUsd, turns, durationMs, output } = await runStep({
    sessionId,
    prompt,
    cwd,
    outputSchema: z.object({ summary: z.string() }),
  });

  await finishStep(db, { stepId, output, costUsd, turns, durationMs });

  console.log(`step ${stepId} · $${costUsd.toFixed(4)} · ${turns} turns`);
  console.log(`session ${sessionId}`);
  console.log(output.summary);
} catch (error) {
  await failStep(db, { stepId, error: String(error) });
  throw error;
} finally {
  removeWorktree({ repo, path: cwd, branch });
}
