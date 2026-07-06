CREATE TYPE "public"."action_status" AS ENUM('Not Started', 'On Progress', 'Done', 'Withdrawn/Cancelled');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('previewed', 'committed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."entry_category" AS ENUM('Best Practice', 'Unlocking');--> statement-breakpoint
CREATE TYPE "public"."pillar" AS ENUM('Social Buzz', 'Personalized CRM', 'Relevant Beauty Lifestyle', 'Activated New Touchpoint', 'Key Territory Execution');--> statement-breakpoint
CREATE TYPE "public"."region" AS ENUM('Jakarta Greater', 'Kalimantan', 'Sumatera', 'CJWJ', 'EJBN');--> statement-breakpoint
CREATE TYPE "public"."score_reason" AS ENUM('new_initiative', 'entry', 'bp_of_week', 'presentation', 'cee_participation', 'cee_best', 'adjustment', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."score_stream" AS ENUM('best_practice', 'presenter', 'cee', 'cee_best');--> statement-breakpoint
CREATE TYPE "public"."segment" AS ENUM('Halal PC', 'Teen & ES', 'Masstige', 'All');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('Idea', 'Pilot', 'Running', 'Ready to Scale');--> statement-breakpoint
CREATE TABLE "action_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"initiative_id" integer NOT NULL,
	"due_date" date,
	"description" text NOT NULL,
	"pic" text NOT NULL,
	"status" "action_status" DEFAULT 'Not Started' NOT NULL,
	"source_entry_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"initiative_id" integer NOT NULL,
	"entry_date" date NOT NULL,
	"category" "entry_category" NOT NULL,
	"detail" text NOT NULL,
	"follow_up" text,
	"bp_of_week_nominated" boolean DEFAULT false NOT NULL,
	"bp_of_week_confirmed_at" timestamp with time zone,
	"link_url" text,
	"outcome_metric" text,
	"outcome_value" text,
	"upload_batch_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "initiatives" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"region" "region" NOT NULL,
	"segment" "segment" NOT NULL,
	"pillar" "pillar" NOT NULL,
	"stage" "stage" DEFAULT 'Idea' NOT NULL,
	"pic" text NOT NULL,
	"link_url" text,
	"tags" text[],
	"replicated_from" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"region" "region" NOT NULL,
	"segment" "segment" NOT NULL,
	"initiative_id" integer,
	"stream" "score_stream" NOT NULL,
	"points" integer NOT NULL,
	"effective_date" date NOT NULL,
	"reason" "score_reason" NOT NULL,
	"ref_id" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"initiative_id" integer NOT NULL,
	"from_stage" "stage" NOT NULL,
	"to_stage" "stage" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"file_hash" text NOT NULL,
	"row_count" integer NOT NULL,
	"status" "batch_status" DEFAULT 'previewed' NOT NULL,
	"uploaded_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_super" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_source_entry_id_entries_id_fk" FOREIGN KEY ("source_entry_id") REFERENCES "public"."entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_upload_batch_id_upload_batches_id_fk" FOREIGN KEY ("upload_batch_id") REFERENCES "public"."upload_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_replicated_from_initiatives_id_fk" FOREIGN KEY ("replicated_from") REFERENCES "public"."initiatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_changes" ADD CONSTRAINT "stage_changes_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_changes" ADD CONSTRAINT "stage_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_batches" ADD CONSTRAINT "upload_batches_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_initiative_date_idx" ON "entries" USING btree ("initiative_id","entry_date");--> statement-breakpoint
CREATE INDEX "initiatives_title_trgm_idx" ON "initiatives" USING gin (lower("title") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "score_events_area_idx" ON "score_events" USING btree ("region","segment");--> statement-breakpoint
CREATE INDEX "score_events_effective_date_idx" ON "score_events" USING btree ("effective_date");--> statement-breakpoint
CREATE INDEX "score_events_initiative_idx" ON "score_events" USING btree ("initiative_id");--> statement-breakpoint
CREATE UNIQUE INDEX "upload_batches_file_hash_idx" ON "upload_batches" USING btree ("file_hash");