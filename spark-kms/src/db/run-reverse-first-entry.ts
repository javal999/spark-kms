import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { reverseFirstEntryPoints } from "@/src/db/reverse-first-entry-points";

/**
 * One-shot data migration for the 2026-07-28 scoring rule change (new initiative
 * = +1 only; first entry folds in). Reverses the legacy first-entry +1 on every
 * existing initiative through the ledger. Idempotent: safe to re-run (a second
 * run reverses 0).
 *
 * Run against production AFTER deploying the code change:
 *   tsx --env-file=<prod.env> src/db/run-reverse-first-entry.ts
 */
async function main() {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`is_super = true AND active = true`)
    .orderBy(users.id)
    .limit(1);
  if (!admin) {
    throw new Error("No active super-admin found to attribute the reversal to.");
  }
  const { reversed } = await reverseFirstEntryPoints(admin.id);
  console.log(
    `Reversed ${reversed} first-entry score event(s), attributed to super-admin #${admin.id}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
