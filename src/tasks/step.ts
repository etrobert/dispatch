import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type Db } from "../db.js";
import { failStep, finishStep, startStep } from "./db.js";
import { runAgent, type Workspace } from "../agent/index.js";

// Whether a step opened a pull request is the one thing read out of an output
// otherwise opaque to this layer. Roles will declare it; until then any step
// may report one.
const published = z.object({ prUrl: z.url().optional() });

// A node in the task's graph, and the agent run behind it. Knows nothing about
// what the step is for: the caller supplies the prompt, the schema and the
// workspace, because those are what differ between roles.
export async function takeStep<Schema extends z.ZodType>(
  db: Db,
  step: {
    taskId: string;
    parentStepId?: string;
    commentId?: string;
    prompt: string;
    workspace: Workspace;
    outputSchema: Schema;
  },
): Promise<{ stepId: string; output: z.infer<Schema> }> {
  const stepId = randomUUID();
  const runId = randomUUID();
  const model = process.env.DISPATCH_MODEL ?? "opus";

  await startStep(db, {
    stepId,
    taskId: step.taskId,
    parentStepId: step.parentStepId,
    commentId: step.commentId,
    runId,
  });

  try {
    const { costUsd, turns, output } = await runAgent(db, {
      runId,
      workspace: step.workspace,
      prompt: step.prompt,
      model,
      outputSchema: step.outputSchema,
    });

    await finishStep(db, {
      stepId,
      prUrl: published.parse(output).prUrl ?? null,
    });

    console.log(`step ${stepId} · $${costUsd.toFixed(4)} · ${turns} turns`);

    return { stepId, output };
  } catch (error) {
    // The reason is already on the run; the step records only that it failed.
    await failStep(db, stepId);
    throw error;
  }
}
