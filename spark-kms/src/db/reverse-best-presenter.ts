import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { scoreEvents } from "@/src/db/schema";
import { reverse } from "@/src/services/scoring";

/**
 * D25 / REQ-S11: reverse every active `best_presenter` score event.
 *
 * "Best Presenter of the Week" is retired, so no initiative should keep a point
 * from it. Each event gets a compensating negative event through the ledger
 * (REQ-S2) — the original rows stay for audit, and the leaderboard stops
 * counting them.
 *
 * Idempotent: an event that already has a reversal is skipped, so a second run
 * reverses 0. Targets by REASON, so the `entry` and `new_initiative` points
 * sharing the contribution stream are untouched.
 *
 * Run against production AFTER a DB snapshot:
 *   tsx --env-file=<prod.env> src/db/run-reverse-best-presenter.ts
 */
export async function reverseBestPresenter(
  actorId: number,
): Promise<{ reversed: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT se.id FROM ${scoreEvents} se
      WHERE se.reason = 'best_presenter'
        AND NOT EXISTS (
          SELECT 1 FROM ${scoreEvents} r
          WHERE r.reason = 'reversal' AND r.ref_id = se.id
        )
      ORDER BY se.id
    `);
    const ids = (rows as unknown as Array<{ id: number }>).map((r) =>
      Number(r.id),
    );
    for (const id of ids) {
      await reverse(id, { actorId, note: "D25 Best Presenter retired" }, tx);
    }
    return { reversed: ids.length };
  });
}
