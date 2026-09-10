-- D32: the CEE pillar is stored under its full name, "Core Excellence
-- Execution", matching what REQ-U8 and section 4.1 have claimed since v1.2.
--
-- HAND-WRITTEN, replacing what `drizzle-kit generate` produced. Drizzle emits a
-- drop-and-recreate for an enum value change:
--     ALTER TABLE initiatives ALTER COLUMN pillar SET DATA TYPE text;
--     DROP TYPE pillar;
--     CREATE TYPE pillar AS ENUM (... without 'CEE' ...);
--     ALTER TABLE initiatives ALTER COLUMN pillar SET DATA TYPE pillar USING pillar::pillar;
-- That final cast fails for every row still holding 'CEE' — on production it
-- aborts with `invalid input value for enum pillar: "CEE"`, and it appears to
-- succeed only on a database that happens to have no CEE rows (a fresh test db).
--
-- ALTER TYPE ... RENAME VALUE is the correct operation: it is atomic, rewrites
-- no table data, and carries every existing row to the new spelling by
-- definition — so there is no separate backfill to run and no window in which
-- a row holds a value its type does not accept.
--
-- Idempotent: re-running is a no-op, so a partially-applied deploy can be
-- replayed safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'pillar' AND e.enumlabel = 'CEE'
  ) THEN
    ALTER TYPE "public"."pillar" RENAME VALUE 'CEE' TO 'Core Excellence Execution';
  END IF;
END $$;
