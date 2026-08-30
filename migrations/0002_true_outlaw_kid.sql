ALTER TABLE "steps" ADD COLUMN "parent_step_id" text;--> statement-breakpoint
ALTER TABLE "steps" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_parent_step_id_steps_step_id_fk" FOREIGN KEY ("parent_step_id") REFERENCES "public"."steps"("step_id") ON DELETE no action ON UPDATE no action;