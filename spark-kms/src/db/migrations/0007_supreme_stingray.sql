CREATE TABLE "error_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"trace_id" text NOT NULL,
	"route" text NOT NULL,
	"actor_id" integer,
	"name" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "error_events_created_idx" ON "error_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "error_events_trace_idx" ON "error_events" USING btree ("trace_id");