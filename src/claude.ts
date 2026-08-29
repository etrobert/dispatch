import {
  query,
  type PostToolUseFailureHookInput,
} from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireEnv } from "./env.js";

export const MODEL = "opus";

export async function runStep<Schema extends z.ZodType>({
  sessionId,
  prompt,
  cwd,
  outputSchema,
  onToolFailure,
}: {
  sessionId: string;
  prompt: string;
  cwd: string;
  outputSchema: Schema;
  onToolFailure: (failure: PostToolUseFailureHookInput) => Promise<void>;
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
      // Unset, the SDK runs its own bundled CLI, missing the local config.
      pathToClaudeCodeExecutable: requireEnv("CLAUDE_BIN"),
      outputFormat: { type: "json_schema", schema },
      extraArgs: { "session-id": sessionId },
      hooks: {
        // Recorded as it happens: a step that dies takes an in-memory list
        // with it, and a failing step is the one whose failures matter most.
        PostToolUseFailure: [
          {
            hooks: [
              async (input) => {
                // The callback is typed against every hook event, so narrowing
                // is what gets us the failure fields.
                if (input.hook_event_name === "PostToolUseFailure") {
                  await onToolFailure(input);
                }

                return { continue: true };
              },
            ],
          },
        ],
      },
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
