import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { scoreEvents } from "@/src/db/schema";
import { createInitiative } from "@/src/services/initiatives";
import {
  postAdjustment,
  rotateViewerPassword,
  createAdmin,
  setUserActive,
} from "@/src/services/admin";
import { getViewerEpoch, verifyViewerPassword, verifyAdminCredentials } from "@/src/services/auth";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";

let actor: number;

async function pointsFor(initiativeId: number, reason: string): Promise<number> {
  const [{ t }] = await db
    .select({ t: sql<number>`coalesce(sum(points),0)::int` })
    .from(scoreEvents)
    .where(sql`initiative_id = ${initiativeId} AND reason = ${reason}`);
  return t;
}

const AREA = {
  region: "Sumatera" as const,
  segment: "Masstige" as const,
  pillar: "Social Buzz" as const,
  stage: "Idea" as const,
  pic: "P",
  category: "Best Practice" as const,
  detail: "d",
};

beforeEach(async () => {
  await resetAndSeed();
  actor = await getSuperAdminId();
});

describe("auto-award at submit (v1.2, D14 — no confirmation)", () => {
  it("a ticked Best Practice of the Week auto-awards +2 immediately", async () => {
    const { initiativeId } = await createInitiative(
      { ...AREA, title: "BP topic", entryDate: "2026-07-01", bpOfWeekNominated: true },
      actor,
    );
    expect(await pointsFor(initiativeId, "bp_of_week")).toBe(2);
  });

  it("a retired Best Presenter flag awards nothing (D25)", async () => {
    const { initiativeId } = await createInitiative(
      {
        ...AREA,
        title: "BPres topic",
        entryDate: "2026-07-01",
        bpOfWeekNominated: false,
        bestPresenter: true,
      } as never,
      actor,
    );
    expect(await pointsFor(initiativeId, "best_presenter")).toBe(0);
  });

  it("the second Best Practice in the same Area/week is capped (no +2)", async () => {
    await createInitiative(
      { ...AREA, title: "First", entryDate: "2026-07-01", bpOfWeekNominated: true },
      actor,
    );
    const second = await createInitiative(
      { ...AREA, title: "Second", entryDate: "2026-07-02", bpOfWeekNominated: true },
      actor,
    );
    expect(await pointsFor(second.initiativeId, "bp_of_week")).toBe(0);
  });

  it("no flags → no weekly points", async () => {
    const { initiativeId } = await createInitiative(
      { ...AREA, title: "Plain", entryDate: "2026-07-01", bpOfWeekNominated: false },
      actor,
    );
    expect(await pointsFor(initiativeId, "bp_of_week")).toBe(0);
    expect(await pointsFor(initiativeId, "best_presenter")).toBe(0);
  });
});

describe("adjustments (REQ-S3)", () => {
  it("posts an adjustment with a note, and rejects an empty note", async () => {
    const ok = await postAdjustment(
      { region: "Sumatera", segment: "Masstige", stream: "best_practice", points: -5, effectiveDate: "2026-07-01", note: "dispute resolved" },
      actor,
    );
    expect(ok.status).toBe("awarded");
    await expect(
      postAdjustment(
        { region: "Sumatera", segment: "Masstige", stream: "best_practice", points: 5, effectiveDate: "2026-07-01", note: "  " },
        actor,
      ),
    ).rejects.toThrow(/note/i);
  });
});

describe("user management + viewer password rotation", () => {
  it("creates and deactivates an admin", async () => {
    const { id } = await createAdmin({ email: "new@spark.local", name: "New Admin", password: "password123", isSuper: false });
    expect(await verifyAdminCredentials("new@spark.local", "password123")).not.toBeNull();
    await setUserActive(id, false);
    expect(await verifyAdminCredentials("new@spark.local", "password123")).toBeNull();
  });

  it("rotating the viewer password bumps the epoch and swaps the hash (REQ-A1)", async () => {
    const before = await getViewerEpoch();
    await rotateViewerPassword("brand-new-viewer-pw");
    expect(await getViewerEpoch()).toBe(before + 1);
    expect(await verifyViewerPassword("brand-new-viewer-pw")).toBe(true);
    expect(await verifyViewerPassword("viewer-password-123")).toBe(false);
  });
});
