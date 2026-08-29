import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// Unset, the SDK runs its own bundled CLI, which misses the local config.
const pathToClaudeCodeExecutable = process.env["CLAUDE_BIN"];

if (pathToClaudeCodeExecutable === undefined) {
  throw new Error("CLAUDE_BIN must point at the claude executable");
}

export async function runAgent<Schema extends z.ZodType>(
  prompt: string,
  outputSchema: Schema,
): Promise<z.infer<Schema>> {
  // The CLI rejects the $schema key zod emits.
  const { $schema, ...schema } = z.toJSONSchema(outputSchema);

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
    return outputSchema.parse(message.structured_output);
  }

  throw new Error("claude produced no result message");
}
