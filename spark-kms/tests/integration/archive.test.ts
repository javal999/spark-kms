import { describe, it, expect, beforeEach } from "vitest";
import {
  createInitiative,
  listInitiatives,
  archiveInitiative,
  restoreInitiative,
  getInitiativeDetail,
} from "@/src/services/initiatives";
import { areaLeaderboard, topInitiatives, dashboardStats } from "@/src/services/scores";
import { findDuplicateCandidates } from "@/src/services/duplicates";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import type { NewInitiativeInput } from "@/src/validation/entry";

/**
 * Soft-archive: an archived initiative disappears from every read surface
 * (lists, dashboard, leaderboard, top, duplicate-matching) but keeps its record
 * and history, and Restore brings it back exactly. No score-ledger writes.
 */
const AREA = { region: "Kalimantan", segment: "Masstige" };
const base = (title: string, bp = false): NewInitiativeInput =>
  ({
    title,
    region: AREA.region,
    segment: AREA.segment,
    pillar: "Social Buzz",
    stage: "Idea",
    pic: "P",
    entryDate: "2026-07-01",
    category: "Best Practice",
    detail: "d",
    bpOfWeekNominated: bp,
  }) as NewInitiativeInput;

describe("initiative archive / restore", () => {
  let actor: number;
  let a: number; // the one we archive

  beforeEach(async () => {
    await resetAndSeed();
    actor = await getSuperAdminId();
    a = (await createInitiative(base("Alpha Topic", true), actor)).initiativeId;
    await createInitiative(base("Beta Topic"), actor);
  });

  it("archiving removes it from all read surfaces; restore brings it back", async () => {
    // ---- baseline: both visible, Alpha scored + a duplicate candidate ----
    expect((await listInitiatives({})).total).toBe(2);
    expect((await dashboardStats()).total).toBe(2);
    const areaBefore = (await areaLeaderboard()).find(
      (x) => x.region === AREA.region && x.segment === AREA.segment,
    )!;
    expect(areaBefore.total).toBeGreaterThan(0);
    expect((await topInitiatives()).some((t) => t.id === a)).toBe(true);
    expect((await findDuplicateCandidates("Alpha Topic")).some((c) => c.id === a)).toBe(true);

    // ---- archive Alpha ----
    await archiveInitiative(a, actor);

    const list = await listInitiatives({});
    expect(list.total).toBe(1);
    expect(list.rows.some((r) => r.id === a)).toBe(false);
    expect((await dashboardStats()).total).toBe(1);
    expect((await topInitiatives()).some((t) => t.id === a)).toBe(false);
    expect((await findDuplicateCandidates("Alpha Topic")).some((c) => c.id === a)).toBe(false);
    const areaAfter = (await areaLeaderboard()).find(
      (x) => x.region === AREA.region && x.segment === AREA.segment,
    );
    expect(areaAfter?.total ?? 0).toBeLessThan(areaBefore.total); // Alpha's points dropped

    // record + history still there, flagged archived
    const detail = await getInitiativeDetail(a);
    expect(detail).not.toBeNull();
    expect(detail!.initiative.archivedAt).not.toBeNull();

    // findable via the archived view
    expect((await listInitiatives({ archived: "archived" })).rows.some((r) => r.id === a)).toBe(true);

    // ---- restore ----
    await restoreInitiative(a);
    expect((await listInitiatives({})).total).toBe(2);
    expect((await topInitiatives()).some((t) => t.id === a)).toBe(true);
    expect((await findDuplicateCandidates("Alpha Topic")).some((c) => c.id === a)).toBe(true);
    expect((await getInitiativeDetail(a))!.initiative.archivedAt).toBeNull();
  });
});
