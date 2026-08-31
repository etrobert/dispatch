CREATE TABLE "runs" (
	"run_id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"prompt" text NOT NULL,
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"output" jsonb,
	"error" text,
	"cost_usd" real,
	"turns" integer,
	"duration_ms" integer,
	"finished_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "steps" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "tool_failures" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "tool_failures" ADD CONSTRAINT "tool_failures_run_id_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Every step so far was exactly one agent execution, so each becomes a run
-- keyed by the step's own id. `review` and `closed` are step states the agent
-- knew nothing about; from its side those runs simply finished.
INSERT INTO "runs" ("run_id","session_id","prompt","repo","branch","model","status","started_at","output","error","cost_usd","turns","duration_ms","finished_at")
SELECT "step_id","session_id","prompt","repo","branch","model",
       CASE WHEN "status" IN ('running','failed') THEN "status" ELSE 'done' END,
       "started_at","output","error","cost_usd","turns","duration_ms","finished_at"
FROM "steps";--> statement-breakpoint
UPDATE "steps" SET "run_id" = "step_id";--> statement-breakpoint
UPDATE "tool_failures" SET "run_id" = "step_id";
