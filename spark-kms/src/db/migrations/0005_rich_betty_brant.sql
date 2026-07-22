CREATE TABLE "initiative_tags" (
	"initiative_id" integer NOT NULL,
	"tag_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "pic_person_id" integer;--> statement-breakpoint
ALTER TABLE "initiative_tags" ADD CONSTRAINT "initiative_tags_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_tags" ADD CONSTRAINT "initiative_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_tags_pair_idx" ON "initiative_tags" USING btree ("initiative_id","tag_id");--> statement-breakpoint
CREATE INDEX "initiative_tags_tag_idx" ON "initiative_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_lower_idx" ON "tags" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_pic_person_id_people_id_fk" FOREIGN KEY ("pic_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;