import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  upsertByName,
  searchPeople,
  listPeople,
  bulkUpsertNames,
} from "@/src/services/people";
import { createInitiative } from "@/src/services/initiatives";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import { db } from "@/src/db";
import { people, actionItems } from "@/src/db/schema";
import type { NewInitiativeInput } from "@/src/validation/entry";

const base: NewInitiativeInput = {
  title: "Directory topic",
  region: "Sumatera",
  segment: "Masstige",
  pillar: "Social Buzz",
  stage: "Idea",
  pic: "Rina Wulandari",
  entryDate: "2026-07-01",
  category: "Best Practice",
  detail: "d",
  bpOfWeekNominated: false,
};

let actor: number;

describe("PIC directory (v1.2, D9/D15)", () => {
  beforeEach(async () => {
    await resetAndSeed();
    actor = await getSuperAdminId();
  });

  it("upsertByName is case-insensitive find-or-create", async () => {
    const a = await upsertByName("Sri Rafika", actor);
    const b = await upsertByName("  sri rafika ", actor); // same person
    expect(b).toBe(a);
    expect(await listPeople()).toHaveLength(1);
  });

  it("searchPeople matches active names by substring", async () => {
    await upsertByName("Rina Wulandari", actor);
    await upsertByName("Budi Santoso", actor);
    const hits = await searchPeople("rina");
    expect(hits.map((p) => p.name)).toEqual(["Rina Wulandari"]);
  });

  it("bulkUpsertNames adds new names and skips existing", async () => {
    await upsertByName("Sri", actor);
    const res = await bulkUpsertNames(["Sri", "Budi", "  ", "Ana"], actor);
    expect(res.added).toBe(2); // Budi, Ana (Sri exists, blank skipped)
    expect(res.total).toBe(3);
  });

  it("creating an initiative adds its PIC to the directory", async () => {
    await createInitiative(base, actor);
    const rows = await searchPeople("Rina");
    expect(rows.map((p) => p.name)).toContain("Rina Wulandari");
  });

  it("action items inherit the given PIC instead of 'Unassigned' (D15)", async () => {
    const res = await createInitiative(
      { ...base, followUp: "chase the vendor" },
      actor,
      { createActionItem: true, actionItemPic: "Rina Wulandari" },
    );
    const [ai] = await db
      .select()
      .from(actionItems)
      .where(eq(actionItems.id, res.actionItemIds[0]));
    expect(ai.pic).toBe("Rina Wulandari");
  });
});
