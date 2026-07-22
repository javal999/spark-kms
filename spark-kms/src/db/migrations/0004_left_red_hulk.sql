CREATE TYPE "public"."link_type" AS ENUM('explicit', 'co_tag', 'replicated_from', 'derived_similar');--> statement-breakpoint
CREATE TYPE "public"."usage_event_type" AS ENUM('page_view', 'click');--> statement-breakpoint
CREATE TABLE "initiative_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"src_id" integer NOT NULL,
	"dst_id" integer NOT NULL,
	"type" "link_type" NOT NULL,
	"weight" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "usage_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"route_pattern" text NOT NULL,
	"event_type" "usage_event_type" NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" "usage_event_type" NOT NULL,
	"route_pattern" text NOT NULL,
	"path" text,
	"element_id" text,
	"element_text" text,
	"session_id" text NOT NULL,
	"actor_hash" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"viewport_w" integer,
	"viewport_h" integer,
	"click_x_norm" real,
	"click_y_norm" real,
	"referrer_path" text
);
--> statement-breakpoint
ALTER TABLE "initiative_links" ADD CONSTRAINT "initiative_links_src_id_initiatives_id_fk" FOREIGN KEY ("src_id") REFERENCES "public"."initiatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_links" ADD CONSTRAINT "initiative_links_dst_id_initiatives_id_fk" FOREIGN KEY ("dst_id") REFERENCES "public"."initiatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_links" ADD CONSTRAINT "initiative_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_links_edge_idx" ON "initiative_links" USING btree ("src_id","dst_id","type");--> statement-breakpoint
CREATE INDEX "initiative_links_src_idx" ON "initiative_links" USING btree ("src_id");--> statement-breakpoint
CREATE INDEX "initiative_links_dst_idx" ON "initiative_links" USING btree ("dst_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_daily_bucket_idx" ON "usage_daily" USING btree ("day","route_pattern","event_type");--> statement-breakpoint
CREATE INDEX "usage_events_route_idx" ON "usage_events" USING btree ("route_pattern");--> statement-breakpoint
CREATE INDEX "usage_events_ts_idx" ON "usage_events" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "usage_events_element_idx" ON "usage_events" USING btree ("element_id");