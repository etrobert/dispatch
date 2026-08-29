CREATE TABLE "steps" (
	"step_id" text PRIMARY KEY NOT NULL,
	"task_id" text,
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
CREATE TABLE "tasks" (
	"task_id" text PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"description" text NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_task_id_tasks_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("task_id") ON DELETE no action ON UPDATE no action;