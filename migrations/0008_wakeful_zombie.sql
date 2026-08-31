ALTER TABLE "tool_failures" DROP CONSTRAINT "tool_failures_step_id_steps_step_id_fk";
--> statement-breakpoint
ALTER TABLE "tool_failures" ALTER COLUMN "run_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "steps" DROP COLUMN "session_id";--> statement-breakpoint
ALTER TABLE "steps" DROP COLUMN "prompt";--> statement-breakpoint
ALTER TABLE "steps" DROP COLUMN "repo";--> statement-breakpoint
ALTER TABLE "steps" DROP COLUMN "branch";--> statement-breakpoint
ALTER TABLE "steps" DROP COLUMN "model";--> statement-breakpoint
ALTER TABLE "steps" DROP COLUMN "output";--> statement-breakpoint
ALTER TABLE "steps" DROP COLUMN "error";--> statement-breakpoint
ALTER TABLE "steps" DROP COLUMN "cost_usd";--> statement-breakpoint
ALTER TABLE "steps" DROP COLUMN "turns";--> statement-breakpoint
ALTER TABLE "steps" DROP COLUMN "duration_ms";--> statement-breakpoint
ALTER TABLE "tool_failures" DROP COLUMN "step_id";