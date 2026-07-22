import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { initiatives, initiativeLinks } from "@/src/db/schema";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import {
  createExplicitLink,
  deleteExplicitLink,
  forwardLinks,
  backlinks,
  neighbors2hop,
  orphanIds,
  buildGraph,
  egoGraph,
  relatedInitiatives,
  SelfLinkError,
  DuplicateLinkError,
} from "@/src/services/links";

async function insertIni(
  actor: number,
  over: { title: string; tags?: string[] | null; replicatedFrom?: number | null },
): Promise<number> {
  const [row] = await db
    .insert(initiatives)
    .values({
      title: over.title,
      region: "Jakarta Greater",
      segment: "Masstige",
      pillar: "Social Buzz",
      stage: "Idea",
      pic: "P",
      createdBy: actor,
      tags: over.tags ?? null,
      replicatedFrom: over.replicatedFrom ?? null,
    })
    .returning({ id: initiatives.id });
  return row.id;
}

let actor: number;
let A: number, B: number, C: number, D: number;

describe("links service (T5–T8)", () => {
  beforeEach(async () => {
    await resetAndSeed();
    actor = await getSuperAdminId();
    // A & B share "activation" (case-insensitive) → co_tag.
    A = await insertIni(actor, { title: "Alpha activation", tags: ["Activation", "Popup"] });
    B = await insertIni(actor, { title: "Beta activation", tags: ["activation"] });
    // C has only a generic tag → no co_tag, no other edge → orphan.
    C = await insertIni(actor, { title: "Gamma generic", tags: ["all"] });
    // D was replicated from A → replicated_from edge D→A.
    D = await insertIni(actor, { title: "Delta replica", tags: null, replicatedFrom: A });
  });

  it("rejects self-links", async () => {
    await expect(createExplicitLink(A, A, actor)).rejects.toBeInstanceOf(SelfLinkError);
  });

  it("rejects duplicate explicit edges (service guard + unique index)", async () => {
    await createExplicitLink(A, B, actor);
    await expect(createExplicitLink(A, B, actor)).rejects.toBeInstanceOf(DuplicateLinkError);
    await expect(
      db.insert(initiativeLinks).values({ srcId: A, dstId: B, type: "explicit", createdBy: actor }),
    ).rejects.toThrow();
  });

  it("forwardLinks/backlinks reflect explicit direction", async () => {
    await createExplicitLink(A, B, actor);
    expect(await forwardLinks(A)).toEqual([B]);
    expect(await backlinks(B)).toEqual([A]);
    expect(await forwardLinks(B)).toEqual([]);
  });

  it("deleteExplicitLink removes the edge", async () => {
    const id = await createExplicitLink(A, B, actor);
    await deleteExplicitLink(id);
    expect(await forwardLinks(A)).toEqual([]);
  });

  it("derives co_tag edges from shared non-generic tags (T7)", async () => {
    const { edges } = await buildGraph();
    const cotag = edges.filter((e) => e.type === "co_tag");
    const ab = cotag.find(
      (e) => e.srcId === Math.min(A, B) && e.dstId === Math.max(A, B),
    );
    expect(ab).toBeTruthy();
    expect(ab?.sharedTags).toEqual(["activation"]);
    // The generic "all" tag on C yields no co_tag edge.
    expect(cotag.some((e) => e.srcId === C || e.dstId === C)).toBe(false);
  });

  it("removing the shared tag disconnects the co_tag edge (T7)", async () => {
    await db.update(initiatives).set({ tags: ["different"] }).where(eq(initiatives.id, B));
    const { edges } = await buildGraph();
    const stillLinked = edges.some(
      (e) =>
        e.type === "co_tag" &&
        (e.srcId === A || e.dstId === A) &&
        (e.srcId === B || e.dstId === B),
    );
    expect(stillLinked).toBe(false);
  });

  it("activates replicated_from as an edge (T8)", async () => {
    const { edges } = await buildGraph();
    expect(
      edges.some((e) => e.type === "replicated_from" && e.srcId === D && e.dstId === A),
    ).toBe(true);
    const relD = await relatedInitiatives(D);
    expect(
      relD.find((r) => r.node.id === A && r.type === "replicated_from" && r.direction === "forward"),
    ).toBeTruthy();
  });

  it("relatedInitiatives combines explicit + co_tag for one initiative", async () => {
    await createExplicitLink(A, B, actor);
    const rel = await relatedInitiatives(A);
    const toB = rel.filter((r) => r.node.id === B);
    expect(toB.some((r) => r.type === "explicit" && r.direction === "forward")).toBe(true);
    expect(toB.some((r) => r.type === "co_tag")).toBe(true);
  });

  it("orphanIds flags initiatives with no edge of any kind", async () => {
    // A/B linked by co_tag; D linked by replicated_from; only C is isolated.
    expect(await orphanIds()).toEqual([C]);
  });

  it("neighbors2hop traverses all edge kinds", async () => {
    await createExplicitLink(A, B, actor);
    // A's neighbors: B (explicit + co_tag) and D (replicated_from). 2-hop adds none.
    expect(await neighbors2hop(A)).toEqual([B, D].sort((a, b) => a - b));
  });

  it("egoGraph returns the initiative + its neighborhood only (T11)", async () => {
    await createExplicitLink(A, B, actor);
    const ego = await egoGraph(A);
    const ids = ego.nodes.map((n) => n.id).sort((x, y) => x - y);
    // A plus its neighbors B (explicit/co_tag) and D (replicated_from); not C.
    expect(ids).toEqual([A, B, D].sort((x, y) => x - y));
    expect(ego.nodes.some((n) => n.id === C)).toBe(false);
    // Every returned edge stays within the ego node set.
    const inSet = new Set(ids);
    expect(ego.edges.every((e) => inSet.has(e.srcId) && inSet.has(e.dstId))).toBe(true);
  });

  it("buildGraph respects the region filter and drops edges to excluded nodes (T9)", async () => {
    // E shares "activation" with A but lives in a different region.
    const E = await insertIni(actor, { title: "Echo elsewhere", tags: ["activation"] });
    await db.update(initiatives).set({ region: "Sumatera" }).where(eq(initiatives.id, E));

    const sumatera = await buildGraph({ region: ["Sumatera"] });
    expect(sumatera.nodes.map((n) => n.id)).toEqual([E]);

    const jakarta = await buildGraph({ region: ["Jakarta Greater"] });
    expect(jakarta.nodes.some((n) => n.id === E)).toBe(false);
    // The A–E co_tag edge is dropped because E is outside the filtered set.
    expect(jakarta.edges.some((e) => e.srcId === E || e.dstId === E)).toBe(false);
  });
});
