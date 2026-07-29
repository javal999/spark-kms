CREATE TYPE "public"."user_role" AS ENUM('viewer', 'admin', 'super');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'viewer' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "entra_oid" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_entra_oid_unique" UNIQUE("entra_oid");--> statement-breakpoint
-- Backfill (TRD-2026-009): existing users are all admins today, so map the
-- is_super flag onto the new role. Runs atomically with the schema change so no
-- current admin is momentarily downgraded to the 'viewer' default.
UPDATE "users" SET "role" = (CASE WHEN "is_super" THEN 'super' ELSE 'admin' END)::"user_role";