import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { scoreEvents } from "@/src/db/schema";
import { award, reverse, reverseEntryScores } from "@/src/services/scoring";
import { resetAndSeed, getSuperAdminId, insertInitiative } from "@/tests/helpers/db";

/**
 * Scoring rulebook tests (requirements §5) — WRITTEN FIRST, per CLAUDE.md.
 * scoring.ts is the only module that writes score_events; these assert every
 * rule, cap, backdating behavior, and reversal.
 */

let actor: number;
let initA: number;
let initB: number;

async function sumFor(where: ReturnType<typeof sql>): Promise<number> {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${scoreEvents.points}),0)::int` })
    .from(scoreEvents)
    .where(where);
  return total;
}

const AREA = { region: "Sumatera", segment: "Masstige" } as const;

beforeEach(async () => {
  await resetAndSeed();
  actor = await getSuperAdminId();
  initA = await insertInitiative(actor, { title: "A", ...AREA });
  initB = await insertInitiative(actor, { title: "B", ...AREA });
});

describe("best_practice stream (§5.1)", () => {
  it("new_initiative awards +1 best_practice", async () => {
    const r = await award({
      reason: "new_initiative",
      initiativeId: initA,
      ...AREA,
      effectiveDate: "2026-07-01",
      actorId: actor,
    });
    expect(r).toMatchObject({ status: "awarded", points: 1, stream: "best_practice" });
  });

  it("entry awards +1, but a second entry same initiative+date is capped (skipped)", async () => {
    const first = await award({
      reason: "entry",
      initiativeId: initA,
      ...AREA,
      effectiveDate: "2026-07-01",
      actorId: actor,
    });
    expect(first.status).toBe("awarded");

    const second = await award({
      reason: "entry",
      initiativeId: initA,
      ...AREA,
      effectiveDate: "2026-07-01",
      actorId: actor,
    });
    expect(second).toEqual({ status: "skipped", reason: "daily-cap" });

    // Only one +1 for initA.
    expect(await sumFor(sql`initiative_id = ${initA}`)).toBe(1);
  });

  it("the daily cap is per-initiative (a different initiative same date still scores)", async () => {
    await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    const other = await award({ reason: "entry", initiativeId: initB, ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    expect(other.status).toBe("awarded");
  });

  it("the daily cap uses effective_date, so a backdated entry is capped on its backdated date", async () => {
    // Backdated entry for 2026-06-01.
    const a = await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-06-01", actorId: actor });
    expect(a.status).toBe("awarded");
    // Same backdated date → capped.
    const b = await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-06-01", actorId: actor });
    expect(b.status).toBe("skipped");
    // A different (later) date → scores again.
    const c = await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-06-02", actorId: actor });
    expect(c.status).toBe("awarded");
  });

  it("bp_of_week awards +2", async () => {
    const r = await award({
      reason: "bp_of_week",
      initiativeId: initA,
      ...AREA,
      effectiveDate: "2026-07-01",
      actorId: actor,
    });
    expect(r).toMatchObject({ status: "awarded", points: 2, stream: "best_practice" });
  });
});

describe("manual streams (§5.2)", () => {
  it("presentation awards +2, capped to 1 per area per week", async () => {
    const first = await award({ reason: "presentation", ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    expect(first).toMatchObject({ status: "awarded", points: 2, stream: "presenter" });
    // Same ISO week (2026-06-29..07-05) → capped.
    const dup = await award({ reason: "presentation", ...AREA, effectiveDate: "2026-07-03", actorId: actor });
    expect(dup).toEqual({ status: "skipped", reason: "area-week-cap" });
  });

  it("presentation cap resets the following week and is per-area", async () => {
    await award({ reason: "presentation", ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    // Next week → allowed.
    const nextWeek = await award({ reason: "presentation", ...AREA, effectiveDate: "2026-07-08", actorId: actor });
    expect(nextWeek.status).toBe("awarded");
    // Same week, different area → allowed.
    const otherArea = await award({
      reason: "presentation",
      region: "CJWJ",
      segment: "Halal PC",
      effectiveDate: "2026-07-01",
      actorId: actor,
    });
    expect(otherArea.status).toBe("awarded");
  });

  it("cee awards +1 and cee_best awards +2 (area-level, no initiative)", async () => {
    const cee = await award({ reason: "cee_participation", ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    expect(cee).toMatchObject({ status: "awarded", points: 1, stream: "cee" });
    const best = await award({ reason: "cee_best", ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    expect(best).toMatchObject({ status: "awarded", points: 2, stream: "cee_best" });
  });

  it("adjustment writes the given points/stream and requires a note", async () => {
    const r = await award({
      reason: "adjustment",
      ...AREA,
      stream: "best_practice",
      points: -3,
      effectiveDate: "2026-07-01",
      actorId: actor,
      note: "manual correction after dispute",
    });
    expect(r).toMatchObject({ status: "awarded", points: -3 });
    await expect(
      award({
        reason: "adjustment",
        ...AREA,
        stream: "best_practice",
        points: 3,
        effectiveDate: "2026-07-01",
        actorId: actor,
        note: "",
      }),
    ).rejects.toThrow(/note/i);
  });
});

describe("reversal (§5.3 REQ-S2)", () => {
  it("reverse writes a compensating negative event; the area sum returns to zero", async () => {
    const r = await award({ reason: "bp_of_week", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    if (r.status !== "awarded") throw new Error("expected award");
    expect(await sumFor(sql`initiative_id = ${initA}`)).toBe(2);

    const rev = await reverse(r.eventId, { actorId: actor, note: "deleted entry" });
    expect(rev.status).toBe("reversed");
    expect(await sumFor(sql`initiative_id = ${initA}`)).toBe(0);
    // Original row still exists — history is never rewritten.
    const rows = await db.select().from(scoreEvents).where(sql`initiative_id = ${initA}`);
    expect(rows).toHaveLength(2);
  });

  it("reversing the same event twice is idempotent", async () => {
    const r = await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    if (r.status !== "awarded") throw new Error("expected award");
    await reverse(r.eventId, { actorId: actor, note: "x" });
    const again = await reverse(r.eventId, { actorId: actor, note: "x" });
    expect(again.status).toBe("already-reversed");
    expect(await sumFor(sql`initiative_id = ${initA}`)).toBe(0);
  });

  it("after reversing an entry's score, a new entry on that date can score again (cap frees up)", async () => {
    const r = await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor, refId: 555 });
    if (r.status !== "awarded") throw new Error("expected award");
    await reverse(r.eventId, { actorId: actor, note: "undo" });
    const again = await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    expect(again.status).toBe("awarded");
  });

  it("reverseEntryScores reverses every active event tied to an entry", async () => {
    const entryId = 4242;
    await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor, refId: entryId });
    await award({ reason: "bp_of_week", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor, refId: entryId });
    expect(await sumFor(sql`initiative_id = ${initA}`)).toBe(3);

    const n = await reverseEntryScores(entryId, { actorId: actor, note: "entry deleted" });
    expect(n).toBe(2);
    expect(await sumFor(sql`initiative_id = ${initA}`)).toBe(0);
  });
});
