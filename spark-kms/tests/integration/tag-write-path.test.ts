import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { initiatives, initiativeTags, tags, people } from "@/src/db/schema";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import { createInitiative } from "@/src/services/initiatives";
import type { NewInitiativeInput } from "@/src/validation/entry";

const base: NewInitiativeInput = {
  title: "Write-path topic",
  region: "Jakarta Greater",
  segment: "Masstige",
  pillar: "Social Buzz",
  stage: "Idea",
  pic: "Sri Rahayu",
  entryDate: "2026-07-01",
  category: "Best Practice",
  detail: "d",
  bpOfWeekNominated: false,
  bestPresenter: false,
};

let actor: number;

describe("entity-graph write path (E11)", () => {
  beforeEach(async () => {
    await resetAndSeed();
    actor = await getSuperAdminId();
  });

  it("creating with tags writes the join AND keeps the tags[] mirror; sets pic_person_id", async () => {
    const { initiativeId } = await createInitiative(
      { ...base, tags: ["Pop-Up", "all"] }, // "all" is generic
      actor,
    );

    // tags[] mirror preserved as written.
    const [ini] = await db
      .select({ tags: initiatives.tags, pid: initiatives.picPersonId })
      .from(initiatives)
      .where(eq(initiatives.id, initiativeId));
    expect(ini.tags).toEqual(["Pop-Up", "all"]);

    // Join has the real tag only (generic excluded).
    const joinRows = await db
      .select({ name: tags.name })
      .from(initiativeTags)
      .innerJoin(tags, eq(tags.id, initiativeTags.tagId))
      .where(eq(initiativeTags.initiativeId, initiativeId));
    expect(joinRows.map((r) => r.name)).toEqual(["Pop-Up"]);

    // pic_person_id resolves to the created person.
    expect(ini.pid).not.toBeNull();
    const [person] = await db.select().from(people).where(eq(people.id, ini.pid!));
    expect(person.name).toBe("Sri Rahayu");
  });

  it("a repeated tag across initiatives reuses one tag row (case-insensitive)", async () => {
    await createInitiative({ ...base, title: "One", tags: ["Activation"] }, actor);
    await createInitiative({ ...base, title: "Two", tags: ["activation"] }, actor);
    const tagRows = await db.select().from(tags);
    const activation = tagRows.filter((t) => t.name.toLowerCase() === "activation");
    expect(activation).toHaveLength(1);
  });
});
