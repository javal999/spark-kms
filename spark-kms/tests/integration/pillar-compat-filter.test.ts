import { describe, it, expect, beforeEach } from "vitest";
import { listInitiatives } from "@/src/services/initiatives";
import { buildEntityGraph } from "@/src/services/graph";
import { resetAndSeed, getSuperAdminId, insertInitiative } from "@/tests/helpers/db";

let actor: number;

beforeEach(async () => {
  await resetAndSeed();
  actor = await getSuperAdminId();
  await insertInitiative(actor, {
    title: "CEE initiative",
    pillar: "Core Excellence Execution",
  });
  await insertInitiative(actor, {
    title: "Social initiative",
    pillar: "Social Buzz",
  });
});

/**
 * D32: `?pillar=CEE` must keep working for partner integrations and for filter
 * links already in circulation.
 *
 * This is not a cosmetic "returns nothing" case. `listInitiatives` builds
 * `inArray(initiatives.pillar, …)` against an ENUM column, so an unnormalized
 * legacy value reaches Postgres as a literal it cannot cast and the request
 * fails outright with `invalid input value for enum pillar: "CEE"` — a 500 on a
 * partner's read, not an empty page. These tests exercise the real SQL path, so
 * they would catch a regression that the schema-level unit tests cannot.
 */
describe("legacy pillar filter reaches the database (D32)", () => {
  it("listInitiatives resolves ?pillar=CEE to the stored value", async () => {
    const legacy = await listInitiatives({ pillar: ["CEE"] });
    expect(legacy.rows.map((r) => r.title)).toEqual(["CEE initiative"]);

    // Identical to filtering by the canonical name — the alias is a spelling,
    // not a second filter with its own behaviour.
    const canonical = await listInitiatives({
      pillar: ["Core Excellence Execution"],
    });
    expect(legacy.rows.map((r) => r.id)).toEqual(canonical.rows.map((r) => r.id));
    expect(legacy.total).toBe(canonical.total);
  });

  it("mixes legacy and canonical values in one filter", async () => {
    const res = await listInitiatives({ pillar: ["CEE", "Social Buzz"] });
    expect(res.rows.map((r) => r.title).sort()).toEqual([
      "CEE initiative",
      "Social initiative",
    ]);
  });

  it("is case-insensitive on the legacy spelling", async () => {
    const res = await listInitiatives({ pillar: ["cee"] });
    expect(res.rows.map((r) => r.title)).toEqual(["CEE initiative"]);
  });

  it("still returns nothing for a pillar that simply has no rows", async () => {
    // The alias must not turn an ordinary empty result into a match.
    const res = await listInitiatives({ pillar: ["Personalized CRM"] });
    expect(res.rows).toEqual([]);
  });

  it("the graph explorer filter accepts the legacy spelling too", async () => {
    const legacy = await buildEntityGraph({ pillar: ["CEE"] });
    const canonical = await buildEntityGraph({
      pillar: ["Core Excellence Execution"],
    });
    expect(legacy.nodes.length).toBeGreaterThan(0);
    expect(legacy.nodes.map((n) => n.ref).sort()).toEqual(
      canonical.nodes.map((n) => n.ref).sort(),
    );
  });
});
