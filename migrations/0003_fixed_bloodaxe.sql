ALTER TABLE "tasks" ADD COLUMN "started_at" timestamp;--> statement-breakpoint
-- Backfill before the state column goes: a task that already ran must not read
-- as unclaimed, or the daemon would pick it up and run it a second time.
UPDATE "tasks" SET "started_at" = "created_at" WHERE "state" <> 'queued';
