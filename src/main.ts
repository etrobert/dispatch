import { query } from "@anthropic-ai/claude-agent-sdk";

const [prompt] = process.argv.slice(2);

if (prompt === undefined) {
  console.error("usage: dispatch <prompt>");
  process.exit(1);
}

// Unset, the SDK runs its own bundled CLI, which misses the local config.
const pathToClaudeCodeExecutable = process.env["CLAUDE_BIN"];

if (pathToClaudeCodeExecutable === undefined) {
  throw new Error("CLAUDE_BIN must point at the claude executable");
}

for await (const message of query({
  prompt,
  options: { model: "haiku", pathToClaudeCodeExecutable },
})) {
  if (message.type !== "result") continue;

  if (message.subtype !== "success" || message.is_error) {
    throw new Error(`claude did not succeed: ${message.subtype}`);
  }

  console.log(message.result);
}
