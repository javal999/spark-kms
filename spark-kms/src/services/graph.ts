import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { initiatives, people, tags, initiativeTags, initiativeLinks } from "@/src/db/schema";
import { canonicalPillars } from "@/src/lib/enums";

/**
 * Multi-entity knowledge-graph projection (Phase 8, task E4). Generalizes the
 * Phase-7 initiative-only build into a typed graph whose nodes are initiatives,
 * people, tags, and the pillar/region/segment dimensions. Node ids are
 * NAMESPACED ("<type>:<id>") so ids don't collide across types. Built in memory
 * at our scale, reusing the links.ts pattern.
 */

export type NodeType = "initiative" | "person" | "tag" | "pillar" | "region" | "segment";
export type EntityEdgeType =
  | "ran"
  | "tagged"
  | "in_pillar"
  | "in_region"
  | "in_segment"
  | "linked"
  | "replicated_from";

export type EntityNode = { ref: string; type: NodeType; label: string };
export type EntityEdge = { src: string; dst: string; type: EntityEdgeType };

export const iniRef = (id: number) => `initiative:${id}`;
export const personRef = (id: number) => `person:${id}`;
export const tagRef = (id: number) => `tag:${id}`;
const dimRef = (type: "pillar" | "region" | "segment", name: string) => `${type}:${name}`;

export type EntityFilter = {
  region?: string[];
  segment?: string[];
  pillar?: string[];
  /** Node types to include; default all. Edges appear only when both ends are in. */
  types?: NodeType[];
};

export async function buildEntityGraph(
  filter?: EntityFilter,
): Promise<{ nodes: EntityNode[]; edges: EntityEdge[] }> {
  const want = (t: NodeType) => !filter?.types || filter.types.includes(t);
  const edgeOk = (a: NodeType, b: NodeType) => want(a) && want(b);

  const conds = [isNull(initiatives.archivedAt)]; // archived initiatives excluded from the entity graph
  if (filter?.region?.length) conds.push(inArray(initiatives.region, filter.region as never[]));
  if (filter?.segment?.length) conds.push(inArray(initiatives.segment, filter.segment as never[]));
  // D32: same legacy-`CEE` tolerance as listInitiatives — graph explorer filter
  // links with `?pillar=CEE` are already in circulation.
  if (filter?.pillar?.length)
    conds.push(inArray(initiatives.pillar, canonicalPillars(filter.pillar) as never[]));

  const inis = await db
    .select({
      id: initiatives.id,
      title: initiatives.title,
      region: initiatives.region,
      segment: initiatives.segment,
      pillar: initiatives.pillar,
      picPersonId: initiatives.picPersonId,
      replicatedFrom: initiatives.replicatedFrom,
    })
    .from(initiatives)
    .where(conds.length ? and(...conds) : undefined);
  const iniIds = new Set(inis.map((i) => i.id));

  const nodes: EntityNode[] = [];
  const seen = new Set<string>();
  const addNode = (ref: string, type: NodeType, label: string) => {
    if (seen.has(ref)) return;
    seen.add(ref);
    nodes.push({ ref, type, label });
  };
  const edges: EntityEdge[] = [];

  for (const i of inis) {
    if (want("initiative")) addNode(iniRef(i.id), "initiative", i.title);
    for (const [dim, val] of [
      ["pillar", i.pillar],
      ["region", i.region],
      ["segment", i.segment],
    ] as const) {
      if (!want(dim)) continue;
      addNode(dimRef(dim, val), dim, val);
      if (edgeOk("initiative", dim)) {
        edges.push({ src: iniRef(i.id), dst: dimRef(dim, val), type: `in_${dim}` as EntityEdgeType });
      }
    }
  }

  // People (RAN).
  if (want("person")) {
    const pids = [...new Set(inis.map((i) => i.picPersonId).filter((x): x is number => !!x))];
    if (pids.length) {
      const persons = await db
        .select({ id: people.id, name: people.name })
        .from(people)
        .where(inArray(people.id, pids));
      for (const p of persons) addNode(personRef(p.id), "person", p.name);
      if (edgeOk("person", "initiative")) {
        for (const i of inis) {
          if (i.picPersonId) edges.push({ src: personRef(i.picPersonId), dst: iniRef(i.id), type: "ran" });
        }
      }
    }
  }

  // Tags (TAGGED).
  if (want("tag")) {
    const rows = await db
      .select({ initiativeId: initiativeTags.initiativeId, tagId: initiativeTags.tagId, name: tags.name })
      .from(initiativeTags)
      .innerJoin(tags, eq(tags.id, initiativeTags.tagId));
    for (const r of rows) {
      if (!iniIds.has(r.initiativeId)) continue;
      addNode(tagRef(r.tagId), "tag", r.name);
      if (edgeOk("initiative", "tag")) {
        edges.push({ src: iniRef(r.initiativeId), dst: tagRef(r.tagId), type: "tagged" });
      }
    }
  }

  // Initiative↔initiative edges (explicit + replicated_from).
  if (edgeOk("initiative", "initiative")) {
    const expl = await db
      .select({ src: initiativeLinks.srcId, dst: initiativeLinks.dstId })
      .from(initiativeLinks)
      .where(eq(initiativeLinks.type, "explicit"));
    for (const e of expl) {
      if (iniIds.has(e.src) && iniIds.has(e.dst)) {
        edges.push({ src: iniRef(e.src), dst: iniRef(e.dst), type: "linked" });
      }
    }
    for (const i of inis) {
      if (i.replicatedFrom && iniIds.has(i.replicatedFrom)) {
        edges.push({ src: iniRef(i.id), dst: iniRef(i.replicatedFrom), type: "replicated_from" });
      }
    }
  }

  return { nodes, edges };
}

// ── Traversal queries (E5) ──────────────────────────────────────────────────

export type InitiativeBrief = {
  id: number;
  title: string;
  region: string;
  segment: string;
  pillar: string;
  stage: string;
};

/** Initiatives run by one person (via the resolved pic_person_id). */
export async function personInitiatives(personId: number): Promise<InitiativeBrief[]> {
  return db
    .select({
      id: initiatives.id,
      title: initiatives.title,
      region: initiatives.region,
      segment: initiatives.segment,
      pillar: initiatives.pillar,
      stage: initiatives.stage,
    })
    .from(initiatives)
    .where(and(eq(initiatives.picPersonId, personId), isNull(initiatives.archivedAt)))
    .orderBy(initiatives.id);
}

/** Initiatives carrying a given tag. */
export async function tagInitiatives(tagId: number): Promise<InitiativeBrief[]> {
  return db
    .select({
      id: initiatives.id,
      title: initiatives.title,
      region: initiatives.region,
      segment: initiatives.segment,
      pillar: initiatives.pillar,
      stage: initiatives.stage,
    })
    .from(initiatives)
    .innerJoin(initiativeTags, eq(initiativeTags.initiativeId, initiatives.id))
    .where(and(eq(initiativeTags.tagId, tagId), isNull(initiatives.archivedAt)))
    .orderBy(initiatives.id);
}

/** One initiative's entity connections (person + tags) for the detail panel (E10). */
export async function initiativeEntities(initiativeId: number): Promise<{
  person: { id: number; name: string } | null;
  tags: { id: number; name: string }[];
}> {
  const [ini] = await db
    .select({ picPersonId: initiatives.picPersonId })
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId))
    .limit(1);

  let person: { id: number; name: string } | null = null;
  if (ini?.picPersonId) {
    const [p] = await db
      .select({ id: people.id, name: people.name })
      .from(people)
      .where(eq(people.id, ini.picPersonId))
      .limit(1);
    person = p ?? null;
  }

  const tagRows = await db
    .select({ id: tags.id, name: tags.name })
    .from(initiativeTags)
    .innerJoin(tags, eq(tags.id, initiativeTags.tagId))
    .where(eq(initiativeTags.initiativeId, initiativeId))
    .orderBy(tags.name);

  return { person, tags: tagRows };
}

/** Tags that co-occur with `tagId` on the same initiatives (for the tag hub). */
export async function adjacentTags(
  tagId: number,
): Promise<{ id: number; name: string; shared: number }[]> {
  const rows = await db.execute(sql`
    SELECT t2.id, t2.name, count(*)::int AS shared
    FROM initiative_tags it1
    JOIN initiative_tags it2
      ON it2.initiative_id = it1.initiative_id AND it2.tag_id <> it1.tag_id
    JOIN tags t2 ON t2.id = it2.tag_id
    WHERE it1.tag_id = ${tagId}
    GROUP BY t2.id, t2.name
    ORDER BY shared DESC, t2.name
  `);
  return (rows as unknown as { id: number; name: string; shared: number }[]).map((r) => ({
    id: Number(r.id),
    name: r.name,
    shared: Number(r.shared),
  }));
}

/**
 * Node refs within `depth` hops of `nodeRef` (undirected, over all edge types),
 * excluding the node itself. Powers "expand from this node" in the explorer.
 */
export async function neighbors(
  nodeRef: string,
  depth = 1,
  filter?: EntityFilter,
): Promise<string[]> {
  const { edges } = await buildEntityGraph(filter);
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  for (const e of edges) link(e.src, e.dst);

  const seen = new Set<string>([nodeRef]);
  let frontier = [nodeRef];
  for (let hop = 0; hop < depth; hop++) {
    const next: string[] = [];
    for (const n of frontier) {
      for (const m of adj.get(n) ?? []) {
        if (!seen.has(m)) {
          seen.add(m);
          next.push(m);
        }
      }
    }
    frontier = next;
  }
  seen.delete(nodeRef);
  return [...seen].sort();
}
