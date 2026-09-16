import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { initiatives, tags, people } from "@/src/db/schema";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import { backfillTags } from "@/src/db/backfill-tags";
import { backfillPic } from "@/src/db/backfill-pic";

async function ini(
  actor: number,
  over: { title: string; pic?: string; tags?: string[] | null },
): Promise<number> {
  const [row] = await db
    .insert(initiatives)
    .values({
      title: over.title,
      region: "Jakarta Greater",
      segment: "Masstige",
      pillar: "Social Buzz",
      stage: "Idea",
      pic: over.pic ?? "Sri",
      tags: over.tags ?? null,
      createdBy: actor,
    })
    .returning({ id: initiatives.id });
  return row.id;
}

let actor: number;

describe("entity backfills (E2, E3)", () => {
  beforeEach(async () => {
    await resetAndSeed();
    actor = await getSuperAdminId();
  });

  it("E2: backfills tags + join from tags[], excluding generics, idempotently", async () => {
    await ini(actor, { title: "A", tags: ["Activation", "popup", "all"] }); // "all" generic
    await ini(actor, { title: "B", tags: ["activation", "Activation"] }); // dup + case
    await ini(actor, { title: "C", tags: null });

    const first = await backfillTags();
    // Distinct non-generic tags: "Activation" (case-folded) + "popup" = 2.
    expect(first.totalTags).toBe(2);
    // Links: A→activation, A→popup, B→activation = 3.
    expect(first.linksCreated).toBe(3);

    const tagRows = await db.select().from(tags);
    expect(tagRows.map((t) => t.name.toLowerCase()).sort()).toEqual(["activation", "popup"]);
    // No generic tag persisted.
    expect(tagRows.some((t) => t.name.toLowerCase() === "all")).toBe(false);

    // Idempotent: second run creates no new links.
    const second = await backfillTags();
    expect(second.linksCreated).toBe(0);
    expect(second.totalTags).toBe(2);
  });

  it("E3: resolves pic → people, dedups by name, counts blanks, idempotent", async () => {
    const a = await ini(actor, { title: "A", pic: "Sri Rahayu" });
    const b = await ini(actor, { title: "B", pic: "sri rahayu" }); // same person, different case
    const c = await ini(actor, { title: "C", pic: "  " }); // blank

    const res = await backfillPic(actor);
    expect(res.resolved).toBe(2);
    expect(res.blank).toBe(1);

    const rows = await db
      .select({ id: initiatives.id, pid: initiatives.picPersonId })
      .from(initiatives)
      .orderBy(initiatives.id);
    const byId = new Map(rows.map((r) => [r.id, r.pid]));
    expect(byId.get(a)).not.toBeNull();
    expect(byId.get(a)).toBe(byId.get(b)); // one person for both casings
    expect(byId.get(c)).toBeNull(); // blank left null

    // Exactly one "Sri Rahayu" in the directory.
    const persons = await db.select().from(people).where(eq(people.name, "Sri Rahayu"));
    expect(persons).toHaveLength(1);

    // Idempotent: re-running keeps the same mapping.
    const again = await backfillPic(actor);
    expect(again.resolved).toBe(2);
    const after = await db
      .select({ pid: initiatives.picPersonId })
      .from(initiatives)
      .where(eq(initiatives.id, a));
    expect(after[0].pid).toBe(byId.get(a));
  });
});
