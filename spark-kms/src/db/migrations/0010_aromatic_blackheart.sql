CREATE TABLE "slow_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"route" text NOT NULL,
	"ms" integer NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "slow_requests_created_idx" ON "slow_requests" USING btree ("created_at");