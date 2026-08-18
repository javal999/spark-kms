import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { reallocateStreams } from "@/src/db/reallocate-streams";

/**
 * D23 one-shot data migration (REQ-S8). Moves historical `new_initiative` and
 * `entry` points off the best_practice stream and onto contribution, through
 * the ledger. Idempotent: safe to re-run (a second run moves 0).
 *
 * Past area totals do not change — `total` is the sum of both streams — but the
 * split between the two leaderboard columns does. That shift is expected.
 *
 * Run against production AFTER taking a DB snapshot, and record the result in
 * MIGRATIONS.md:
 *   tsx --env-file=<prod.env> src/db/run-reallocate-streams.ts
 */
async function main() {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`is_super = true AND active = true`)
    .orderBy(users.id)
    .limit(1);
  if (!admin) {
    throw new Error("No active super-admin found to attribute the reversals to.");
  }

  const { moved, skipped } = await reallocateStreams(admin.id);
  console.log(
    `Moved ${moved} score event(s) to the contribution stream; skipped ${skipped}.`,
  );
  if (skipped > 0) {
    console.warn(
      "Skipped events hit a cap or had no initiative — inspect them before assuming the migration is complete.",
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
