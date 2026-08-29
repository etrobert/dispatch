import { query } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// Unset, the SDK runs its own bundled CLI, which misses the local config.
const pathToClaudeCodeExecutable = process.env["CLAUDE_BIN"];

if (pathToClaudeCodeExecutable === undefined) {
  throw new Error("CLAUDE_BIN must point at the claude executable");
}

export async function runAgent<Schema extends z.ZodType>({
  prompt,
  cwd,
  outputSchema,
}: {
  prompt: string;
  cwd: string;
  outputSchema: Schema;
}): Promise<{
  sessionId: string;
  costUsd: number;
  turns: number;
  output: z.infer<Schema>;
}> {
  // Assigning the id up front makes it a key the caller owns before the run.
  const sessionId = randomUUID();

  // The CLI rejects the $schema key zod emits.
  const { $schema, ...schema } = z.toJSONSchema(outputSchema);

  for await (const message of query({
    prompt,
    options: {
      cwd,
      model: "haiku",
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      pathToClaudeCodeExecutable,
      outputFormat: { type: "json_schema", schema },
      extraArgs: { "session-id": sessionId },
    },
  })) {
    if (message.type !== "result") continue;

    if (message.subtype !== "success" || message.is_error) {
      throw new Error(`claude did not succeed: ${message.subtype}`);
    }

    if (message.session_id !== sessionId) {
      throw new Error(`session id not applied: got ${message.session_id}`);
    }

    // A success result carries no structured output when the model gives up on
    // the schema, so parsing is the only thing that catches it.
    return {
      sessionId,
      costUsd: message.total_cost_usd,
      turns: message.num_turns,
      output: outputSchema.parse(message.structured_output),
    };
  }

  throw new Error("claude produced no result message");
}
