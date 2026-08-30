ALTER TABLE "steps" ALTER COLUMN "task_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_failures" ALTER COLUMN "step_id" SET NOT NULL;