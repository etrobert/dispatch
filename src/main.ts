import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { MODEL, runStep } from "./claude.js";
import { failStep, finishStep, openDb, startStep } from "./db.js";
import { createWorktree, removeWorktree } from "./worktree.js";

const [prompt, repo = process.cwd()] = process.argv.slice(2);

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
startStep(db, { stepId, sessionId, prompt, repo, branch, model: MODEL });

try {
  const { costUsd, turns, durationMs, output } = await runStep({
    sessionId,
    prompt,
    cwd,
    outputSchema: z.object({ summary: z.string() }),
  });

  finishStep(db, { stepId, output, costUsd, turns, durationMs });

  console.log(`step ${stepId} · $${costUsd.toFixed(4)} · ${turns} turns`);
  console.log(`session ${sessionId}`);
  console.log(output.summary);
} catch (error) {
  failStep(db, { stepId, error: String(error) });
  throw error;
} finally {
  removeWorktree({ repo, path: cwd, branch });
}
