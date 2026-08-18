import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { reverseBestPresenter } from "@/src/db/reverse-best-presenter";

/**
 * D25 one-shot data migration (REQ-S11). Reverses every Best Presenter of the
 * Week point through the ledger, so no initiative keeps a point from a retired
 * award. Idempotent: safe to re-run (a second run reverses 0).
 *
 * Area totals will drop by exactly the number of Best Presenter awards ever
 * granted. Record the count in MIGRATIONS.md.
 *
 *   tsx --env-file=<prod.env> src/db/run-reverse-best-presenter.ts
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

  const { reversed } = await reverseBestPresenter(admin.id);
  console.log(`Reversed ${reversed} Best Presenter score event(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
