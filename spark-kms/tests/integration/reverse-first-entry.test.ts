import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/src/db";
import { scoreEvents } from "@/src/db/schema";
import {
  createInitiative,
  appendEntry,
} from "@/src/services/initiatives";
import { initiativeStreamTotals } from "@/src/services/scores";
import { reverseFirstEntryPoints } from "@/src/db/reverse-first-entry-points";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import type { NewInitiativeInput } from "@/src/validation/entry";

/**
 * The 2026-07-28 retro migration: existing initiatives created under the OLD
 * rule carry a first-entry `entry` +1 that must be reversed (the first entry now
 * folds into new_initiative). It must reverse ONLY the creation entry's point,
 * leave later progress entries intact, and be idempotent.
 */

const base: NewInitiativeInput = {
  title: "Retro Topic",
  region: "Kalimantan",
  segment: "Masstige",
  pillar: "Social Buzz",
  stage: "Idea",
  pic: "P",
  entryDate: "2026-07-01",
  category: "Best Practice",
  detail: "d",
  bpOfWeekNominated: false,
} as NewInitiativeInput;

let actor: number;

describe("reverseFirstEntryPoints (2026-07-28 rule migration)", () => {
  beforeEach(async () => {
    await resetAndSeed();
    actor = await getSuperAdminId();
  });

  it("reverses the creation entry's +1, keeps later entries, and is idempotent", async () => {
    // New-rule create → +1 new_initiative only.
    const { initiativeId, entryId } = await createInitiative(base, actor);

    // Simulate LEGACY data: the old rule's first-entry +1 on the creation entry.
    await db.insert(scoreEvents).values({
      region: base.region as never,
      segment: base.segment as never,
      initiativeId,
      stream: "best_practice",
      points: 1,
      effectiveDate: base.entryDate,
      reason: "entry",
      refId: entryId,
      createdBy: actor,
    });

    // A genuine later progress entry (different day) → its own +1.
    await appendEntry(
      initiativeId,
      { ...base, entryDate: "2026-07-08", detail: "progress" },
      actor,
    );

    // Before: new(1) + legacy-first-entry(1) + later-entry(1) = 3.
    expect((await initiativeStreamTotals(initiativeId)).total).toBe(3);

    const { reversed } = await reverseFirstEntryPoints(actor);
    expect(reversed).toBe(1); // only the creation entry's point

    // After: new(1) + later-entry(1) = 2. The later entry survived.
    expect((await initiativeStreamTotals(initiativeId)).total).toBe(2);

    // Idempotent: a second run reverses nothing.
    expect((await reverseFirstEntryPoints(actor)).reversed).toBe(0);
    expect((await initiativeStreamTotals(initiativeId)).total).toBe(2);
  });

  it("no-ops cleanly when there are no legacy first-entry points", async () => {
    // Fresh new-rule create has no first-entry event to reverse.
    await createInitiative({ ...base, title: "Clean" }, actor);
    expect((await reverseFirstEntryPoints(actor)).reversed).toBe(0);
  });
});
