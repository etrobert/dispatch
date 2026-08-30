import { randomUUID } from "node:crypto";
import { z } from "zod";
import { model, runStep } from "./claude.js";
import {
  failStep,
  finishStep,
  recordToolFailure,
  startStep,
  type Db,
} from "./db.js";

// Whether a step opened a pull request is the one thing read out of an output
// otherwise opaque to this layer. Roles will declare it; until then any step
// may report one.
const published = z.object({ prUrl: z.url().optional() });

// One agent invocation, recorded from start to finish. Knows nothing about what
// the step is for: the caller supplies the prompt, the schema and the worktree
// to run in, because those are what differ between roles.
export async function takeStep<Schema extends z.ZodType>(
  db: Db,
  step: {
    taskId: string;
    parentStepId?: string;
    commentId?: string;
    prompt: string;
    cwd: string;
    repo: string;
    branch: string;
    outputSchema: Schema;
  },
): Promise<{ stepId: string; output: z.infer<Schema> }> {
  const stepId = randomUUID();
  const sessionId = randomUUID();
  // Resolved once, so the row records exactly what the run was handed.
  const stepModel = model();

  await startStep(db, {
    stepId,
    taskId: step.taskId,
    parentStepId: step.parentStepId,
    commentId: step.commentId,
    sessionId,
    prompt: step.prompt,
    repo: step.repo,
    branch: step.branch,
    model: stepModel,
  });

  // Everything past here has a row to fail, which is why the insert sits
  // outside the try.
  try {
    const { costUsd, turns, durationMs, output } = await runStep({
      sessionId,
      prompt: step.prompt,
      cwd: step.cwd,
      model: stepModel,
      outputSchema: step.outputSchema,
      onToolFailure: (failure) =>
        recordToolFailure(db, stepId, {
          toolName: failure.tool_name,
          error: failure.error,
          durationMs: failure.duration_ms ?? null,
        }),
    });

    await finishStep(db, {
      stepId,
      output,
      prUrl: published.parse(output).prUrl ?? null,
      costUsd,
      turns,
      durationMs,
    });

    console.log(`step ${stepId} · $${costUsd.toFixed(4)} · ${turns} turns`);

    return { stepId, output };
  } catch (error) {
    await failStep(db, { stepId, error: String(error) });
    throw error;
  }
}
