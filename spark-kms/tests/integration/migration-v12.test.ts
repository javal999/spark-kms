import { describe, it, expect, beforeEach } from "vitest";
import { sql, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { scoreEvents } from "@/src/db/schema";
import { createInitiative } from "@/src/services/initiatives";
import { award } from "@/src/services/scoring";
import { reverseRetiredStreams } from "@/src/db/reverse-retired-streams";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import type { NewInitiativeInput } from "@/src/validation/entry";

let actor: number;
const AREA = { region: "Sumatera" as const, segment: "Masstige" as const };

const base: NewInitiativeInput = {
  title: "Migration topic",
  ...AREA,
  pillar: "Social Buzz",
  stage: "Idea",
  pic: "P",
  entryDate: "2026-07-01",
  category: "Best Practice",
  detail: "d",
  bpOfWeekNominated: false,
  bestPresenter: false,
};

async function sumStream(stream: string): Promise<number> {
  const [{ t }] = await db
    .select({ t: sql<number>`coalesce(sum(points),0)::int` })
    .from(scoreEvents)
    .where(eq(scoreEvents.stream, stream as never));
  return t;
}

describe("v1.2 retired-stream reversal (REQ-S5)", () => {
  beforeEach(async () => {
    await resetAndSeed();
    actor = await getSuperAdminId();
  });

  it("nets cee/cee_best/presentation to zero, keeps the 2 live streams, idempotent", async () => {
    // Live data: +1 new (best_practice; first entry folds in) and a new best_presenter +2.
    const ini = await createInitiative(base, actor);
    await award({ reason: "best_presenter", initiativeId: ini.initiativeId, ...AREA, effectiveDate: "2026-07-01", actorId: actor });

    // Simulate pre-migration retired-stream rows (reasons no longer awardable).
    await db.insert(scoreEvents).values([
      { ...AREA, initiativeId: null, stream: "presenter", points: 2, effectiveDate: "2026-07-01", reason: "presentation", createdBy: actor },
      { ...AREA, initiativeId: null, stream: "cee", points: 1, effectiveDate: "2026-07-01", reason: "cee_participation", createdBy: actor },
      { ...AREA, initiativeId: null, stream: "cee_best", points: 2, effectiveDate: "2026-07-01", reason: "cee_best", createdBy: actor },
    ]);

    const res = await reverseRetiredStreams(actor);
    expect(res.reversed).toBe(3);

    // Retired streams net to zero; live streams intact.
    expect(await sumStream("cee")).toBe(0);
    expect(await sumStream("cee_best")).toBe(0);
    expect(await sumStream("best_practice")).toBe(1); // +1 new (first entry folds in)
    expect(await sumStream("presenter")).toBe(2); // best_presenter survives; presentation netted

    // Idempotent.
    expect((await reverseRetiredStreams(actor)).reversed).toBe(0);
  });
});
