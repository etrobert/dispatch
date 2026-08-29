import { query } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const MODEL = "opus";

// Unset, the SDK runs its own bundled CLI, which misses the local config.
// Read here rather than at import, so commands that run no agent don't need it.
function claudeExecutable(): string {
  const path = process.env["CLAUDE_BIN"];

  if (path === undefined) {
    throw new Error("CLAUDE_BIN must point at the claude executable");
  }

  return path;
}

export async function runStep<Schema extends z.ZodType>({
  sessionId,
  prompt,
  cwd,
  outputSchema,
}: {
  sessionId: string;
  prompt: string;
  cwd: string;
  outputSchema: Schema;
}): Promise<{
  costUsd: number;
  turns: number;
  durationMs: number;
  output: z.infer<Schema>;
}> {
  // The CLI rejects the $schema key zod emits.
  const { $schema, ...schema } = z.toJSONSchema(outputSchema);

  for await (const message of query({
    prompt,
    options: {
      cwd,
      model: MODEL,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      pathToClaudeCodeExecutable: claudeExecutable(),
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
      costUsd: message.total_cost_usd,
      turns: message.num_turns,
      durationMs: message.duration_ms,
      output: outputSchema.parse(message.structured_output),
    };
  }

  throw new Error("claude produced no result message");
}
