import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  updateInitiativeFields,
  updateEntryFields,
  updateActionItemFields,
  getInitiativeEditLog,
} from "@/src/services/edits";
import { createInitiative } from "@/src/services/initiatives";
import { initiativeStreamTotals } from "@/src/services/scores";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import { db } from "@/src/db";
import { entries, initiatives, actionItems } from "@/src/db/schema";
import type { NewInitiativeInput } from "@/src/validation/entry";

const base: NewInitiativeInput = {
  title: "Old title",
  region: "Sumatera",
  segment: "Masstige",
  pillar: "Activated New Touchpoint",
  stage: "Idea",
  pic: "Sri",
  entryDate: "2026-07-01",
  category: "Best Practice",
  detail: "Original detail",
  followUp: "chase vendor",
  bpOfWeekNominated: false,
  bestPresenter: false,
};

let actor: number;

async function makeInitiative() {
  return createInitiative(base, actor, { createActionItem: true });
}

describe("admin edits + edit log (Feature 1)", () => {
  beforeEach(async () => {
    await resetAndSeed();
    actor = await getSuperAdminId();
  });

  it("logs each changed initiative field (old → new) and skips unchanged", async () => {
    const { initiativeId } = await makeInitiative();

    const changed = await updateInitiativeFields(
      initiativeId,
      { title: "New title", pillar: "Social Buzz", pic: base.pic },
      actor,
    );
    expect(changed).toBe(2); // title + pillar; pic unchanged

    const log = await getInitiativeEditLog(initiativeId);
    const titleRow = log.find((r) => r.field === "title");
    expect(titleRow).toMatchObject({
      entity: "initiative",
      oldValue: "Old title",
      newValue: "New title",
      editorName: "Super Admin",
    });
    expect(log.find((r) => r.field === "pic")).toBeUndefined();

    // The row actually changed.
    const [ini] = await db
      .select()
      .from(initiatives)
      .where(eq(initiatives.id, initiativeId));
    expect(ini.title).toBe("New title");
    expect(ini.pillar).toBe("Social Buzz");

    // No-op edit logs nothing.
    expect(
      await updateInitiativeFields(initiativeId, { title: "New title" }, actor),
    ).toBe(0);
  });

  it("does not log an empty-string edit on a field that was already empty", async () => {
    const { initiativeId } = await makeInitiative(); // no description / linkUrl
    // The edit form sends "" for cleared optional fields — that must not count
    // as a change against a null column (no spurious "∅ → ∅" rows).
    const changed = await updateInitiativeFields(
      initiativeId,
      { description: "", linkUrl: "" },
      actor,
    );
    expect(changed).toBe(0);
    expect(await getInitiativeEditLog(initiativeId)).toHaveLength(0);
  });

  it("edits entry descriptive fields WITHOUT changing the date or the score", async () => {
    const { initiativeId, entryId } = await makeInitiative();
    const before = await initiativeStreamTotals(initiativeId);

    await updateEntryFields(
      entryId,
      { detail: "Edited detail", category: "Unlocking" },
      actor,
    );

    const after = await initiativeStreamTotals(initiativeId);
    expect(after).toEqual(before); // scoring untouched

    const [entry] = await db.select().from(entries).where(eq(entries.id, entryId));
    expect(entry.detail).toBe("Edited detail");
    expect(entry.category).toBe("Unlocking");
    expect(entry.entryDate).toBe(base.entryDate); // date is locked

    const log = await getInitiativeEditLog(initiativeId);
    expect(log.some((r) => r.entity === "entry" && r.field === "detail")).toBe(true);
  });

  it("edits an action item and logs the change", async () => {
    const { initiativeId, actionItemIds } = await makeInitiative();
    const aid = actionItemIds[0];

    await updateActionItemFields(
      aid,
      { status: "Done", description: "Call the vendor twice" },
      actor,
    );

    const [ai] = await db
      .select()
      .from(actionItems)
      .where(eq(actionItems.id, aid));
    expect(ai.status).toBe("Done");
    expect(ai.description).toBe("Call the vendor twice");

    const log = await getInitiativeEditLog(initiativeId);
    const statusRow = log.find(
      (r) => r.entity === "action_item" && r.field === "status",
    );
    expect(statusRow).toMatchObject({ oldValue: "Not Started", newValue: "Done" });
  });

  it("aggregates the whole initiative's history newest-first with the editor name", async () => {
    const { initiativeId, entryId, actionItemIds } = await makeInitiative();
    await updateInitiativeFields(initiativeId, { title: "T2" }, actor);
    await updateEntryFields(entryId, { detail: "D2" }, actor);
    await updateActionItemFields(actionItemIds[0], { status: "On Progress" }, actor);

    const log = await getInitiativeEditLog(initiativeId);
    expect(log).toHaveLength(3);
    expect(new Set(log.map((r) => r.entity))).toEqual(
      new Set(["initiative", "entry", "action_item"]),
    );
    // newest-first ordering
    for (let i = 1; i < log.length; i++) {
      expect(log[i - 1].editedAt.getTime()).toBeGreaterThanOrEqual(
        log[i].editedAt.getTime(),
      );
    }
    expect(log.every((r) => r.editorName === "Super Admin")).toBe(true);
  });
});
