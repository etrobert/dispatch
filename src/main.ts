import { z } from "zod";
import { runAgent } from "./claude.js";

const [prompt, cwd = process.cwd()] = process.argv.slice(2);

if (prompt === undefined) {
  console.error("usage: dispatch <prompt> [directory]");
  process.exit(1);
}

const { sessionId, costUsd, turns, output } = await runAgent({
  prompt,
  cwd,
  outputSchema: z.object({ summary: z.string() }),
});

console.log(`session ${sessionId} · $${costUsd.toFixed(4)} · ${turns} turns`);
console.log(output.summary);
