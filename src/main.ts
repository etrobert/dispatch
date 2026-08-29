import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

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

const Output = z.object({ summary: z.string() });

// The CLI rejects the $schema key zod emits.
const { $schema, ...schema } = z.toJSONSchema(Output);

for await (const message of query({
  prompt,
  options: {
    model: "haiku",
    pathToClaudeCodeExecutable,
    outputFormat: { type: "json_schema", schema },
  },
})) {
  if (message.type !== "result") continue;

  if (message.subtype !== "success" || message.is_error) {
    throw new Error(`claude did not succeed: ${message.subtype}`);
  }

  // A success result carries no structured output when the model gives up on
  // the schema, so parsing is the only thing that catches it.
  const output = Output.parse(message.structured_output);

  console.log(output.summary);
}
