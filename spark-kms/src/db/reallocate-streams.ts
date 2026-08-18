import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { scoreEvents } from "@/src/db/schema";
import { award, reverse } from "@/src/services/scoring";

/**
 * D23 retroactive stream reallocation (REQ-S8).
 *
 * Before D23, `new_initiative` and `entry` points were written to the
 * best_practice stream. D23 makes best_practice mean one thing only — "won Best
 * Practice of the Week" — and moves everything else to the contribution stream
 * (enum value `presenter`).
 *
 * This moves the history so the leaderboard columns mean the same thing across
 * all time. Each event is reversed through the ledger and re-issued on the new
 * stream; the original row and its points are never edited or deleted
 * (REQ-S2). Net effect per event: best_practice −1, contribution +1.
 *
 * Idempotent: it only selects events that are still active AND still on
 * best_practice, so a second run finds nothing. Manual `adjustment` events are
 * left alone — an admin chose that stream deliberately.
 *
 * Run against production AFTER a DB snapshot:
 *   tsx --env-file=<prod.env> src/db/run-reallocate-streams.ts
 */
export async function reallocateStreams(
  actorId: number,
): Promise<{ moved: number; skipped: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT se.id, se.region::text AS region, se.segment::text AS segment,
             se.initiative_id, se.effective_date, se.reason::text AS reason,
             se.ref_id, se.created_by
      FROM ${scoreEvents} se
      WHERE se.reason IN ('new_initiative', 'entry')
        AND se.stream = 'best_practice'
        AND NOT EXISTS (
          SELECT 1 FROM ${scoreEvents} r
          WHERE r.reason = 'reversal' AND r.ref_id = se.id
        )
      ORDER BY se.id
    `);

    const legacy = rows as unknown as Array<{
      id: number;
      region: string;
      segment: string;
      initiative_id: number | null;
      effective_date: string;
      reason: "new_initiative" | "entry";
      ref_id: number | null;
      created_by: number;
    }>;

    let moved = 0;
    let skipped = 0;

    for (const ev of legacy) {
      if (ev.initiative_id == null) {
        // Both reasons always carry an initiative; a row without one is
        // malformed, so leave it for a human rather than guessing.
        skipped++;
        continue;
      }

      await reverse(
        Number(ev.id),
        { actorId, note: "D23 stream reallocation" },
        tx,
      );

      const result = await award(
        {
          reason: ev.reason,
          initiativeId: Number(ev.initiative_id),
          region: ev.region,
          segment: ev.segment,
          effectiveDate: ev.effective_date,
          // Keep the point with whoever earned it, not with whoever ran this.
          actorId: Number(ev.created_by),
          refId: ev.ref_id == null ? undefined : Number(ev.ref_id),
        },
        tx,
      );

      // A cap can only bite if the legacy data already broke it (two active
      // `entry` events for one initiative on one date). Count it rather than
      // silently dropping the point.
      if (result.status === "awarded") moved++;
      else skipped++;
    }

    return { moved, skipped };
  });
}
