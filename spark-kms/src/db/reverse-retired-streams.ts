import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { scoreEvents } from "@/src/db/schema";
import { reverse } from "@/src/services/scoring";

/**
 * v1.2 migration (REQ-S5): reverse every active score event from a retired
 * award — reason `presentation` (the old standalone Presenter +2, now in the
 * `presenter` stream that v1.2 repurposes for Best Presenter, so it MUST be
 * cleared) and `cee_participation` / `cee_best` (CEE moved to a pillar).
 *
 * Goes through the ledger (`reverse` writes compensating negative events) — NO
 * raw deletes (REQ-S2). Idempotent: an event already reversed is skipped, so a
 * second run is a no-op. Targets by REASON, never by stream, so the new
 * best_presenter awards (reason `best_presenter`, stream `presenter`) are left
 * untouched.
 */
export async function reverseRetiredStreams(
  actorId: number,
): Promise<{ reversed: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT se.id FROM ${scoreEvents} se
      WHERE se.reason IN ('presentation', 'cee_participation', 'cee_best')
        AND NOT EXISTS (
          SELECT 1 FROM ${scoreEvents} r
          WHERE r.reason = 'reversal' AND r.ref_id = se.id
        )
    `);
    const ids = (rows as unknown as Array<{ id: number }>).map((r) =>
      Number(r.id),
    );
    for (const id of ids) {
      await reverse(id, { actorId, note: "v1.2 retired-stream reversal" }, tx);
    }
    return { reversed: ids.length };
  });
}
