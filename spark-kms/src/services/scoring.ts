import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { scoreEvents } from "@/src/db/schema";
import { weekDateRange } from "@/src/services/week";

/**
 * THE ONLY module allowed to write score_events (CLAUDE.md). Every displayed
 * score is a SUM over the rows written here — totals are never stored.
 *
 * Implements the requirements §5 rulebook. Two streams, reallocated by D23:
 *   best_practice ("Best Practice"): bp_of_week +2 only (max 1/area/week).
 *   presenter ("Contribution"): new_initiative +1 (the first entry folds in,
 *                  D20), entry +1 (max 1/initiative/day on effective_date).
 *                  Best Presenter of the Week was retired by D25 and all its
 *                  events reversed (REQ-S11).
 *   adjustment:    arbitrary points on a chosen stream (note required; any
 *                  admin since D24, not super-admin only)
 * The `cee` / `cee_best` streams were retired in v1.2 (D10/D11); their events
 * were reversed through the ledger, and the enum values remain for audit only.
 * Deletes/un-scoring write compensating `reversal` events; history is never
 * rewritten (REQ-S2).
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type Stream = (typeof scoreEvents.stream.enumValues)[number];

interface AreaFields {
  region: string;
  segment: string;
  effectiveDate: string; // YYYY-MM-DD
  actorId: number;
}

export type AwardInput =
  | ({ reason: "new_initiative"; initiativeId: number; refId?: number } & AreaFields)
  | ({ reason: "entry"; initiativeId: number; refId?: number } & AreaFields)
  | ({ reason: "bp_of_week"; initiativeId: number; refId?: number } & AreaFields)
  | ({
      reason: "adjustment";
      stream: Stream;
      points: number;
      note: string;
      initiativeId?: number | null;
      refId?: number;
    } & AreaFields);

export type AwardResult =
  | { status: "awarded"; eventId: number; points: number; stream: Stream }
  | { status: "skipped"; reason: "daily-cap" | "area-week-cap" };

// Reason → (stream, base points). Two streams (D11/D12), reallocated by D23:
//   best_practice  = the Best-Practice-of-the-Week award, and NOTHING else.
//   presenter      = everything else earned by contributing. Displayed as
//                    "Contribution"; the enum value stays `presenter` because
//                    the DB enum and the API field name are in production use.
const RULES: Record<string, { stream: Stream; points: number }> = {
  new_initiative: { stream: "presenter", points: 1 },
  entry: { stream: "presenter", points: 1 },
  bp_of_week: { stream: "best_practice", points: 2 },
  // `best_presenter` retired by D25. The enum value stays for the historical
  // rows (all reversed by REQ-S11); nothing awards it any more.
};

/** SQL predicate: this event id has NOT been reversed. */
const notReversed = (idCol = sql`se.id`) =>
  sql`NOT EXISTS (SELECT 1 FROM ${scoreEvents} r WHERE r.reason = 'reversal' AND r.ref_id = ${idCol})`;

async function awardImpl(event: AwardInput, tx: Tx): Promise<AwardResult> {
  // --- caps (checked against ACTIVE, non-reversed events) ---
  if (event.reason === "entry") {
    const existing = await tx.execute(sql`
      SELECT se.id FROM ${scoreEvents} se
      WHERE se.reason = 'entry'
        AND se.initiative_id = ${event.initiativeId}
        AND se.effective_date = ${event.effectiveDate}
        AND ${notReversed()}
      LIMIT 1
    `);
    if ((existing as unknown as unknown[]).length > 0) {
      return { status: "skipped", reason: "daily-cap" };
    }
  }

  // v1.2 (D14): the weekly award is capped 1 per Area per week. The first
  // ticked entry in an Area that week scores; later ones are skipped.
  if (event.reason === "bp_of_week") {
    const { start, end } = weekDateRange(event.effectiveDate);
    const existing = await tx.execute(sql`
      SELECT se.id FROM ${scoreEvents} se
      WHERE se.reason = ${event.reason}
        AND se.region = ${event.region}::region
        AND se.segment = ${event.segment}::segment
        AND se.effective_date BETWEEN ${start} AND ${end}
        AND ${notReversed()}
      LIMIT 1
    `);
    if ((existing as unknown as unknown[]).length > 0) {
      return { status: "skipped", reason: "area-week-cap" };
    }
  }

  // --- derive stream + points ---
  let stream: Stream;
  let points: number;
  let note: string | null = null;

  if (event.reason === "adjustment") {
    if (!event.note || event.note.trim().length === 0) {
      throw new Error("adjustment events require a note");
    }
    stream = event.stream;
    points = event.points;
    note = event.note.trim();
  } else {
    const rule = RULES[event.reason];
    stream = rule.stream;
    points = rule.points;
  }

  const initiativeId =
    "initiativeId" in event && event.initiativeId != null
      ? event.initiativeId
      : null;

  const [row] = await tx
    .insert(scoreEvents)
    .values({
      region: event.region as never,
      segment: event.segment as never,
      initiativeId,
      stream,
      points,
      effectiveDate: event.effectiveDate,
      reason: event.reason,
      refId: event.refId ?? null,
      note,
      createdBy: event.actorId,
    })
    .returning({ id: scoreEvents.id });

  return { status: "awarded", eventId: row.id, points, stream };
}

/** Award a score event (in a passed transaction, or its own). */
export async function award(event: AwardInput, tx?: Tx): Promise<AwardResult> {
  if (tx) return awardImpl(event, tx);
  return db.transaction((t) => awardImpl(event, t));
}

export type ReverseResult =
  | { status: "reversed"; eventId: number }
  | { status: "already-reversed" }
  | { status: "not-found" };

async function reverseImpl(
  eventId: number,
  opts: { actorId: number; note?: string },
  tx: Tx,
): Promise<ReverseResult> {
  const rows = await tx
    .select()
    .from(scoreEvents)
    .where(sql`id = ${eventId}`)
    .limit(1);
  const orig = rows[0];
  if (!orig) return { status: "not-found" };
  if (orig.reason === "reversal") return { status: "already-reversed" };

  const already = await tx.execute(sql`
    SELECT id FROM ${scoreEvents} WHERE reason = 'reversal' AND ref_id = ${eventId} LIMIT 1
  `);
  if ((already as unknown as unknown[]).length > 0) {
    return { status: "already-reversed" };
  }

  const [row] = await tx
    .insert(scoreEvents)
    .values({
      region: orig.region,
      segment: orig.segment,
      initiativeId: orig.initiativeId,
      stream: orig.stream,
      points: -orig.points,
      effectiveDate: orig.effectiveDate,
      reason: "reversal",
      refId: eventId,
      note: opts.note ?? `reversal of #${eventId}`,
      createdBy: opts.actorId,
    })
    .returning({ id: scoreEvents.id });

  return { status: "reversed", eventId: row.id };
}

/** Write a compensating negative event for `eventId` (idempotent). */
export async function reverse(
  eventId: number,
  opts: { actorId: number; note?: string },
  tx?: Tx,
): Promise<ReverseResult> {
  if (tx) return reverseImpl(eventId, opts, tx);
  return db.transaction((t) => reverseImpl(eventId, opts, t));
}

/**
 * Reverse every active score event tied to an entry (its `entry` +1 and any
 * confirmed `bp_of_week` +2). Used when an entry is deleted. Returns the number
 * of events reversed.
 */
export async function reverseEntryScores(
  entryRefId: number,
  opts: { actorId: number; note?: string },
  tx?: Tx,
): Promise<number> {
  const run = async (t: Tx) => {
    const active = await t.execute(sql`
      SELECT se.id FROM ${scoreEvents} se
      WHERE se.ref_id = ${entryRefId}
        -- best_presenter stays in this list so deleting an OLD entry still
        -- reverses its historical point (the award itself is retired, D25).
        AND se.reason IN ('entry', 'bp_of_week', 'best_presenter')
        AND ${notReversed()}
    `);
    const ids = (active as unknown as Array<{ id: number }>).map((r) =>
      Number(r.id),
    );
    for (const id of ids) await reverseImpl(id, opts, t);
    return ids.length;
  };
  return tx ? run(tx) : db.transaction(run);
}

/**
 * Reverse every active score event for an initiative (its new_initiative,
 * entries, and bp confirmations). Used when an initiative is deleted / detached
 * (REQ-D4 wrong-merge recovery). Returns the number of events reversed.
 */
export async function reverseInitiativeScores(
  initiativeId: number,
  opts: { actorId: number; note?: string },
  tx?: Tx,
): Promise<number> {
  const run = async (t: Tx) => {
    const active = await t.execute(sql`
      SELECT se.id FROM ${scoreEvents} se
      WHERE se.initiative_id = ${initiativeId}
        AND se.reason <> 'reversal'
        AND ${notReversed()}
    `);
    const ids = (active as unknown as Array<{ id: number }>).map((r) =>
      Number(r.id),
    );
    for (const id of ids) await reverseImpl(id, opts, t);
    return ids.length;
  };
  return tx ? run(tx) : db.transaction(run);
}
