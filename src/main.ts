import { z } from "zod";
import { runAgent } from "./claude.js";

const [prompt] = process.argv.slice(2);

if (prompt === undefined) {
  console.error("usage: dispatch <prompt>");
  process.exit(1);
}

const output = await runAgent(prompt, z.object({ summary: z.string() }));

console.log(output.summary);
