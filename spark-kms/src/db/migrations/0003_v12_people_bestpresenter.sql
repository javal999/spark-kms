ALTER TYPE "public"."pillar" ADD VALUE 'CEE';--> statement-breakpoint
ALTER TYPE "public"."score_reason" ADD VALUE 'best_presenter' BEFORE 'presentation';--> statement-breakpoint
CREATE TABLE "people" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "best_presenter" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "people_name_lower_idx" ON "people" USING btree (lower("name"));