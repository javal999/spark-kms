import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { scoreEvents } from "@/src/db/schema";
import { reverse } from "@/src/services/scoring";

/**
 * One-shot data migration for the 2026-07-28 scoring rule change: a new
 * initiative now earns +1 (new_initiative) ONLY — its FIRST entry no longer
 * scores its own +1 (that first entry folds into the create point). Existing
 * initiatives were created under the old rule and carry a first-entry `entry`
 * +1 that must be reversed so old and new data are scored consistently.
 *
 * For each initiative it targets the `entry` score event tied to that
 * initiative's FIRST entry (the creation entry = the lowest entry id) and
 * reverses it through the ledger (`reverse` writes a compensating negative
 * event) — NO raw deletes (REQ-S2). Later progress entries keep their +1.
 *
 * Idempotent: an event already reversed is skipped, so a second run reverses 0.
 */
export async function reverseFirstEntryPoints(
  actorId: number,
): Promise<{ reversed: number }> {
  return db.transaction(async (tx) => {
    // The `entry` score event of each initiative's creation entry (min entry id),
    // excluding any already reversed.
    const rows = await tx.execute(sql`
      WITH first_entry AS (
        SELECT initiative_id, MIN(id) AS entry_id
        FROM entries
        GROUP BY initiative_id
      )
      SELECT se.id
      FROM ${scoreEvents} se
      JOIN first_entry fe
        ON fe.entry_id = se.ref_id
       AND fe.initiative_id = se.initiative_id
      WHERE se.reason = 'entry'
        AND NOT EXISTS (
          SELECT 1 FROM ${scoreEvents} r
          WHERE r.reason = 'reversal' AND r.ref_id = se.id
        )
    `);
    const ids = (rows as unknown as Array<{ id: number }>).map((r) =>
      Number(r.id),
    );
    for (const id of ids) {
      await reverse(
        id,
        { actorId, note: "2026-07-28 rule: first entry folds into new_initiative" },
        tx,
      );
    }
    return { reversed: ids.length };
  });
}
