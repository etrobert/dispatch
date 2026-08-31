import { type PostToolUseFailureHookInput } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { runStep } from "./claude.js";
import { ensureRepo } from "./repos.js";
import { withBranch } from "./worktree.js";

// Where an agent runs: a repository to clone and the branch the work belongs
// on. Cloning, fetching, the worktree and its removal are all this module's
// business — the caller only names the two.
export type Workspace = { repo: string; branch: string };

// Run one agent in a worktree of its own and report what it cost. Knows nothing
// about tasks, steps or pull requests: everything it needs is in the arguments.
export function runAgent<Schema extends z.ZodType>({
  workspace,
  sessionId,
  prompt,
  model,
  outputSchema,
  onToolFailure,
}: {
  workspace: Workspace;
  sessionId: string;
  prompt: string;
  model: string;
  outputSchema: Schema;
  onToolFailure: (failure: PostToolUseFailureHookInput) => Promise<void>;
}): Promise<{
  costUsd: number;
  turns: number;
  durationMs: number;
  output: z.infer<Schema>;
}> {
  return withBranch(ensureRepo(workspace.repo), workspace.branch, (cwd) =>
    runStep({ sessionId, prompt, cwd, model, outputSchema, onToolFailure }),
  );
}
