import { describe, it, expect, beforeEach } from "vitest";
import { createInitiative, listInitiatives } from "@/src/services/initiatives";
import { areaLeaderboard } from "@/src/services/scores";
import { parseWorkbook } from "@/src/services/upload";
import { buildUploadFile, validRow } from "@/tests/helpers/xlsx";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import type { NewInitiativeInput } from "@/src/validation/entry";

/**
 * Task 3: "Sulawesi" is a valid Region everywhere — the add-initiative path, the
 * bulk-upload validator, and the Region × Segment leaderboard. An unknown region
 * still fails validation.
 */
let actor: number;

beforeEach(async () => {
  await resetAndSeed();
  actor = await getSuperAdminId();
});

describe("Region: Sulawesi", () => {
  it("accepts Sulawesi on the add-initiative path and surfaces it as an area", async () => {
    const input: NewInitiativeInput = {
      title: "Sulawesi Launch",
      region: "Sulawesi",
      segment: "Masstige",
      pillar: "Social Buzz",
      stage: "Idea",
      pic: "P",
      entryDate: "2026-07-01",
      category: "Best Practice",
      detail: "d",
      bpOfWeekNominated: true,
    };
    const { initiativeId } = await createInitiative(input, actor);
    expect(initiativeId).toBeGreaterThan(0);

    const list = await listInitiatives({ region: ["Sulawesi"] });
    expect(list.rows.some((r) => r.id === initiativeId)).toBe(true);

    const area = (await areaLeaderboard()).find(
      (a) => a.region === "Sulawesi" && a.segment === "Masstige",
    );
    expect(area).toBeTruthy();
    expect(area!.total).toBeGreaterThan(0); // +1 new, +2 bp
  });

  it("accepts Sulawesi in a bulk-upload row and rejects an unknown region", async () => {
    const buf = await buildUploadFile([
      validRow({ "Topic/Tema": "Sulawesi Row", Region: "Sulawesi" }),
      validRow({ "Topic/Tema": "Bad Row", Region: "Atlantis" }),
    ]);
    const { rows } = await parseWorkbook(buf);
    expect(rows[0].data?.region).toBe("Sulawesi");
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].data).toBeUndefined();
    expect(rows[1].errors.some((e) => /Atlantis/.test(e))).toBe(true);
  });
});
