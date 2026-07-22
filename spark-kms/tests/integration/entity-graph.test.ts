import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { initiatives, people, tags } from "@/src/db/schema";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import { backfillTags } from "@/src/db/backfill-tags";
import { backfillPic } from "@/src/db/backfill-pic";
import { createExplicitLink } from "@/src/services/links";
import {
  buildEntityGraph,
  personInitiatives,
  tagInitiatives,
  neighbors,
  iniRef,
  personRef,
  tagRef,
  type NodeType,
  type EntityEdgeType,
} from "@/src/services/graph";

async function ini(
  actor: number,
  over: { title: string; pic?: string; tags?: string[]; replicatedFrom?: number; region?: string },
): Promise<number> {
  const [row] = await db
    .insert(initiatives)
    .values({
      title: over.title,
      region: (over.region ?? "Jakarta Greater") as never,
      segment: "Masstige",
      pillar: "Social Buzz",
      stage: "Idea",
      pic: over.pic ?? "Sri",
      tags: over.tags ?? null,
      replicatedFrom: over.replicatedFrom ?? null,
      createdBy: actor,
    })
    .returning({ id: initiatives.id });
  return row.id;
}

const typeCount = (nodes: { type: NodeType }[], t: NodeType) =>
  nodes.filter((n) => n.type === t).length;
const edgeTypes = (edges: { type: EntityEdgeType }[]) => new Set(edges.map((e) => e.type));

let actor: number, A: number, B: number;

describe("entity graph projection (E4)", () => {
  beforeEach(async () => {
    await resetAndSeed();
    actor = await getSuperAdminId();
    A = await ini(actor, { title: "Alpha", pic: "Sri", tags: ["pop-up"] });
    B = await ini(actor, { title: "Beta", pic: "Sri", tags: ["pop-up"], replicatedFrom: A });
    await createExplicitLink(A, B, actor);
    await backfillTags();
    await backfillPic(actor);
  });

  it("emits typed nodes: initiative/person/tag + dimension nodes", async () => {
    const { nodes } = await buildEntityGraph();
    expect(typeCount(nodes, "initiative")).toBe(2);
    expect(typeCount(nodes, "person")).toBe(1); // both share PIC "Sri"
    expect(typeCount(nodes, "tag")).toBe(1); // both tagged "pop-up"
    expect(typeCount(nodes, "pillar")).toBe(1);
    expect(typeCount(nodes, "region")).toBe(1);
    expect(typeCount(nodes, "segment")).toBe(1);
  });

  it("emits every edge type with correct endpoints", async () => {
    const { nodes, edges } = await buildEntityGraph();
    expect(edgeTypes(edges)).toEqual(
      new Set(["ran", "tagged", "in_pillar", "in_region", "in_segment", "linked", "replicated_from"]),
    );
    // The person RAN both initiatives.
    const person = nodes.find((n) => n.type === "person")!;
    const ran = edges.filter((e) => e.type === "ran" && e.src === person.ref).map((e) => e.dst).sort();
    expect(ran).toEqual([iniRef(A), iniRef(B)].sort());
    // replicated_from goes B → A.
    expect(edges.some((e) => e.type === "replicated_from" && e.src === iniRef(B) && e.dst === iniRef(A))).toBe(true);
  });

  it("the types filter limits node types and their edges", async () => {
    const { nodes, edges } = await buildEntityGraph({ types: ["initiative", "tag"] });
    expect(typeCount(nodes, "person")).toBe(0);
    expect(typeCount(nodes, "pillar")).toBe(0);
    expect(typeCount(nodes, "tag")).toBe(1);
    // No person/dimension edges survive; tagged + initiative-initiative do.
    expect(edges.some((e) => e.type === "ran" || e.type === "in_pillar")).toBe(false);
    expect(edges.some((e) => e.type === "tagged")).toBe(true);
    expect(edges.some((e) => e.type === "linked")).toBe(true);
  });

  it("the region filter drops out-of-region initiatives and their edges", async () => {
    const C = await ini(actor, { title: "Gamma", pic: "Budi", tags: ["solo-tag"], region: "Sumatera" });
    await backfillTags();
    await backfillPic(actor);
    const { nodes } = await buildEntityGraph({ region: ["Jakarta Greater"] });
    expect(nodes.some((n) => n.ref === iniRef(C))).toBe(false);
    // Budi (only ran the Sumatera one) is absent from the Jakarta view.
    const budiPresent = nodes.some((n) => n.type === "person" && n.label === "Budi");
    expect(budiPresent).toBe(false);
  });

  // E5 traversals
  it("personInitiatives / tagInitiatives return the right sets", async () => {
    const [sri] = await db.select().from(people).where(eq(people.name, "Sri"));
    const [tag] = await db.select().from(tags).where(eq(tags.name, "pop-up"));
    expect((await personInitiatives(sri.id)).map((i) => i.id).sort()).toEqual([A, B].sort());
    expect((await tagInitiatives(tag.id)).map((i) => i.id).sort()).toEqual([A, B].sort());
  });

  it("neighbors respects depth and edge kinds", async () => {
    const [sri] = await db.select().from(people).where(eq(people.name, "Sri"));
    const [tag] = await db.select().from(tags).where(eq(tags.name, "pop-up"));
    // The person's 1-hop neighbors are the initiatives they ran.
    expect(await neighbors(personRef(sri.id), 1)).toEqual([iniRef(A), iniRef(B)].sort());
    // Alpha's 1-hop neighbors span all edge kinds: person, tag, dimensions, Beta.
    const aNbrs = await neighbors(iniRef(A), 1);
    expect(aNbrs).toContain(personRef(sri.id));
    expect(aNbrs).toContain(tagRef(tag.id));
    expect(aNbrs).toContain(iniRef(B));
  });
});
