import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { runAgent } from "./claude.js";
import { createWorktree, removeWorktree } from "./worktree.js";

const [prompt, repo = process.cwd()] = process.argv.slice(2);

if (prompt === undefined) {
  console.error("usage: dispatch <prompt> [repo]");
  process.exit(1);
}

const parent = await mkdtemp(join(tmpdir(), "dispatch-"));
const cwd = join(parent, "worktree");
const branch = `dispatch/${parent.split("-").at(-1)}`;

createWorktree({ repo, path: cwd, branch });

try {
  const { sessionId, costUsd, turns, output } = await runAgent({
    prompt,
    cwd,
    outputSchema: z.object({ summary: z.string() }),
  });

  console.log(`session ${sessionId} · $${costUsd.toFixed(4)} · ${turns} turns`);
  console.log(`worktree ${cwd}`);
  console.log(output.summary);
} finally {
  removeWorktree({ repo, path: cwd, branch });
}
