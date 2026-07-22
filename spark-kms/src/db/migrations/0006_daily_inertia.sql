CREATE TABLE "initiative_embeddings" (
	"initiative_id" integer PRIMARY KEY NOT NULL,
	"embedding" real[] NOT NULL,
	"model" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "initiative_embeddings" ADD CONSTRAINT "initiative_embeddings_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE cascade ON UPDATE no action;