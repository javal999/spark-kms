import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { scoreEvents } from "@/src/db/schema";
import { createInitiative } from "@/src/services/initiatives";
import {
  confirmBpOfWeek,
  listPendingNominations,
  logManualStream,
  postAdjustment,
  rotateViewerPassword,
  createAdmin,
  setUserActive,
} from "@/src/services/admin";
import { getViewerEpoch, verifyViewerPassword, verifyAdminCredentials } from "@/src/services/auth";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";

let actor: number;

async function bpPoints(initiativeId: number): Promise<number> {
  const [{ t }] = await db
    .select({ t: sql<number>`coalesce(sum(points),0)::int` })
    .from(scoreEvents)
    .where(sql`initiative_id = ${initiativeId} AND reason = 'bp_of_week'`);
  return t;
}

beforeEach(async () => {
  await resetAndSeed();
  actor = await getSuperAdminId();
});

describe("BP-of-week confirmation (REQ-A3)", () => {
  async function makeNominated() {
    const r = await createInitiative(
      { title: "Nominated Topic", region: "Sumatera", segment: "Masstige", pillar: "Social Buzz", stage: "Idea", pic: "P", entryDate: "2026-07-01", category: "Best Practice", detail: "d", bpOfWeekNominated: true },
      actor,
    );
    return r;
  }

  it("a nomination alone awards nothing until confirmed", async () => {
    const { initiativeId } = await makeNominated();
    expect(await bpPoints(initiativeId)).toBe(0); // +1 new +1 entry, but no bp yet
    const pending = await listPendingNominations();
    expect(pending.map((p) => p.title)).toContain("Nominated Topic");
  });

  it("confirming awards +2 and stamps confirmed_at (leaves the pending list)", async () => {
    const { initiativeId, entryId } = await makeNominated();
    const res = await confirmBpOfWeek(entryId, actor);
    expect(res).toEqual({ status: "confirmed", points: 2 });
    expect(await bpPoints(initiativeId)).toBe(2);
    expect(await listPendingNominations()).toHaveLength(0);
  });

  it("confirming twice is idempotent (no double +2)", async () => {
    const { initiativeId, entryId } = await makeNominated();
    await confirmBpOfWeek(entryId, actor);
    const again = await confirmBpOfWeek(entryId, actor);
    expect(again.status).toBe("already-confirmed");
    expect(await bpPoints(initiativeId)).toBe(2);
  });

  it("refuses to confirm an entry that was never nominated", async () => {
    const { entryId } = await createInitiative(
      { title: "Not Nominated", region: "CJWJ", segment: "All", pillar: "Social Buzz", stage: "Idea", pic: "P", entryDate: "2026-07-01", category: "Best Practice", detail: "d", bpOfWeekNominated: false },
      actor,
    );
    expect((await confirmBpOfWeek(entryId, actor)).status).toBe("not-nominated");
  });
});

describe("manual streams + adjustments", () => {
  const AREA = { region: "Sumatera", segment: "Masstige" } as const;

  it("logs presenter/cee/cee_best and enforces the presenter 1/area/week cap", async () => {
    expect((await logManualStream({ ...AREA, stream: "presentation", effectiveDate: "2026-07-01" }, actor)).status).toBe("awarded");
    expect((await logManualStream({ ...AREA, stream: "presentation", effectiveDate: "2026-07-03" }, actor)).status).toBe("skipped");
    expect((await logManualStream({ ...AREA, stream: "cee_participation", effectiveDate: "2026-07-01" }, actor)).status).toBe("awarded");
    expect((await logManualStream({ ...AREA, stream: "cee_best", effectiveDate: "2026-07-01" }, actor)).status).toBe("awarded");
  });

  it("posts an adjustment with a note, and rejects an empty note", async () => {
    const ok = await postAdjustment({ ...AREA, stream: "best_practice", points: -5, effectiveDate: "2026-07-01", note: "dispute resolved" }, actor);
    expect(ok.status).toBe("awarded");
    await expect(
      postAdjustment({ ...AREA, stream: "best_practice", points: 5, effectiveDate: "2026-07-01", note: "  " }, actor),
    ).rejects.toThrow(/note/i);
  });
});

describe("user management + viewer password rotation", () => {
  it("creates and deactivates an admin", async () => {
    const { id } = await createAdmin({ email: "new@spark.local", name: "New Admin", password: "password123", isSuper: false });
    expect(await verifyAdminCredentials("new@spark.local", "password123")).not.toBeNull();
    await setUserActive(id, false);
    // Deactivated users can't authenticate.
    expect(await verifyAdminCredentials("new@spark.local", "password123")).toBeNull();
  });

  it("rotating the viewer password bumps the epoch and swaps the hash (REQ-A1)", async () => {
    const before = await getViewerEpoch();
    await rotateViewerPassword("brand-new-viewer-pw");
    expect(await getViewerEpoch()).toBe(before + 1);
    expect(await verifyViewerPassword("brand-new-viewer-pw")).toBe(true);
    expect(await verifyViewerPassword("viewer-password-123")).toBe(false); // old one dead
  });
});
