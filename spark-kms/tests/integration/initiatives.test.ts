import { describe, it, expect, beforeEach } from "vitest";
import {
  createInitiative,
  appendEntry,
  listInitiatives,
  changeStage,
  getInitiativeDetail,
  InitiativeNotFoundError,
} from "@/src/services/initiatives";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import { db } from "@/src/db";
import { stageChanges, actionItems } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import type { NewInitiativeInput } from "@/src/validation/entry";

const base: NewInitiativeInput = {
  title: "Pop up store make over",
  region: "Sumatera",
  segment: "Masstige",
  pillar: "Activated New Touchpoint",
  stage: "Idea",
  pic: "Sri",
  entryDate: "2026-07-01",
  category: "Best Practice",
  detail: "Ran a makeover popup, strong footfall",
  bpOfWeekNominated: false,
};

let actor: number;

describe("initiatives service", () => {
  beforeEach(async () => {
    await resetAndSeed();
    actor = await getSuperAdminId();
  });

  it("createInitiative writes an initiative, first entry, and follow-up action item", async () => {
    const res = await createInitiative(
      { ...base, followUp: "chase mall vendor" },
      actor,
      {
        createActionItem: true,
        actionItem: { description: "chase mall vendor", pic: "Sri" },
      },
    );
    expect(res.initiativeId).toBeGreaterThan(0);
    expect(res.entryId).toBeGreaterThan(0);
    expect(res.actionItemIds).toHaveLength(1);
    expect(res.actionItemIds[0]).toBeGreaterThan(0);

    const detail = await getInitiativeDetail(res.initiativeId);
    expect(detail?.entries).toHaveLength(1);
    expect(detail?.entries[0].detail).toContain("footfall");
    expect(detail?.actionItems).toHaveLength(1);
    expect(detail?.actionItems[0].sourceEntryId).toBe(res.entryId);
  });

  it("splits a numbered follow-up into one action item per item", async () => {
    const res = await createInitiative(
      { ...base, followUp: "1. Call vendor 2. Book venue 3. Send recap" },
      actor,
      { createActionItem: true },
    );
    expect(res.actionItemIds).toHaveLength(3);

    const detail = await getInitiativeDetail(res.initiativeId);
    expect(detail?.actionItems.map((a) => a.description)).toEqual([
      "Call vendor",
      "Book venue",
      "Send recap",
    ]);
    for (const a of detail!.actionItems) {
      expect(a.sourceEntryId).toBe(res.entryId);
    }
  });

  it("does not create an action item when the flag is off", async () => {
    const res = await createInitiative(
      { ...base, followUp: "some follow up" },
      actor,
    );
    expect(res.actionItemIds).toEqual([]);
    const ais = await db
      .select()
      .from(actionItems)
      .where(eq(actionItems.initiativeId, res.initiativeId));
    expect(ais).toHaveLength(0);
  });

  it("appendEntry adds a second entry to the same initiative", async () => {
    const { initiativeId } = await createInitiative(base, actor);
    await appendEntry(
      initiativeId,
      {
        entryDate: "2026-07-03",
        category: "Unlocking",
        detail: "blocker found",
        bpOfWeekNominated: false,
      },
      actor,
    );
    const detail = await getInitiativeDetail(initiativeId);
    expect(detail?.entries).toHaveLength(2);
    // newest first
    expect(detail?.entries[0].entryDate).toBe("2026-07-03");
  });

  it("appendEntry throws InitiativeNotFoundError for a missing id", async () => {
    await expect(
      appendEntry(
        999999,
        {
          entryDate: "2026-07-03",
          category: "Unlocking",
          detail: "x",
          bpOfWeekNominated: false,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(InitiativeNotFoundError);
  });

  it("changeStage updates the stage and logs a stage_change; same stage is a no-op", async () => {
    const { initiativeId } = await createInitiative(base, actor);
    await changeStage(initiativeId, "Pilot", actor);
    const detail = await getInitiativeDetail(initiativeId);
    expect(detail?.initiative.stage).toBe("Pilot");
    expect(detail?.stageChanges).toHaveLength(1);
    expect(detail?.stageChanges[0].fromStage).toBe("Idea");
    expect(detail?.stageChanges[0].toStage).toBe("Pilot");

    // no-op: setting Pilot again writes no new row
    await changeStage(initiativeId, "Pilot", actor);
    const logs = await db
      .select()
      .from(stageChanges)
      .where(eq(stageChanges.initiativeId, initiativeId));
    expect(logs).toHaveLength(1);
  });

  describe("listInitiatives", () => {
    beforeEach(async () => {
      await createInitiative(
        { ...base, title: "Alpha popup", description: "great desc" },
        actor,
      );
      await createInitiative(
        {
          ...base,
          title: "Beta unlocking topic",
          region: "Kalimantan",
          category: "Unlocking",
          detail: "special-needle in detail",
        },
        actor,
      );
    });

    it("searches across title, description, and entry detail", async () => {
      expect((await listInitiatives({ q: "Alpha" })).total).toBe(1);
      expect((await listInitiatives({ q: "great desc" })).total).toBe(1);
      expect((await listInitiatives({ q: "special-needle" })).total).toBe(1);
    });

    it("filters by region and category", async () => {
      expect((await listInitiatives({ region: ["Kalimantan"] })).total).toBe(1);
      expect(
        (await listInitiatives({ category: "Unlocking" })).total,
      ).toBe(1);
    });

    it("flags hasUnlocking correctly", async () => {
      const { rows } = await listInitiatives({ q: "Beta" });
      expect(rows[0].hasUnlocking).toBe(true);
      const { rows: alpha } = await listInitiatives({ q: "Alpha" });
      expect(alpha[0].hasUnlocking).toBe(false);
    });

    it("does not crash on NaN page/pageSize (crafted query strings)", async () => {
      const res = await listInitiatives({
        page: Number("abc"),
        pageSize: Number("xyz"),
      });
      expect(res.rows.length).toBeGreaterThan(0);
      expect(res.total).toBe(2);
    });

    it("sorts by title ascending and descending", async () => {
      const asc = await listInitiatives({ sort: "title", dir: "asc" });
      const desc = await listInitiatives({ sort: "title", dir: "desc" });
      expect(asc.rows[0].title).toBe("Alpha popup");
      expect(desc.rows[0].title).toBe("Beta unlocking topic");
    });
  });
});
