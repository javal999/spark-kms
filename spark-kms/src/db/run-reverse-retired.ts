import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { reverseRetiredStreams } from "@/src/db/reverse-retired-streams";

/**
 * v1.2 one-shot data migration (REQ-S5). Reverses the retired presenter/CEE
 * score events through the ledger so they stop counting — in particular, old
 * standalone-Presenter (`presentation`) events sit in the `presenter` stream
 * that v1.2 reuses for Best Presenter, so they MUST be cleared or they'd show
 * as Best Presenter points. Idempotent: safe to re-run (a second run reverses 0).
 *
 * Run against production AFTER `db:migrate` (0003):
 *   tsx --env-file=<prod.env> src/db/run-reverse-retired.ts
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
  const { reversed } = await reverseRetiredStreams(admin.id);
  console.log(
    `Reversed ${reversed} retired-stream score event(s), attributed to super-admin #${admin.id}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
