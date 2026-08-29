CREATE TABLE "tool_failures" (
	"tool_failure_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_id" text,
	"tool_name" text NOT NULL,
	"error" text NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tool_failures" ADD CONSTRAINT "tool_failures_step_id_steps_step_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."steps"("step_id") ON DELETE no action ON UPDATE no action;