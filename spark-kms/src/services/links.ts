import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { initiativeLinks, initiatives } from "@/src/db/schema";

/**
 * Knowledge-graph service (Phase 7, tasks T6/T7/T8). The ONLY writer of
 * `initiative_links`. Three edge kinds power the graph:
 *   - explicit         — created by an admin, stored in initiative_links
 *   - replicated_from  — derived from initiatives.replicated_from (the inert
 *                        self-FK this activates), NOT stored twice
 *   - co_tag           — derived at read time from shared non-generic tags,
 *                        NOT stored (a tag change reflects on the next read)
 *
 * The combined graph is built in memory from the (small, <3k-node) initiative
 * set rather than a SQL recursive CTE, because two of the three edge kinds are
 * derived and a CTE can't traverse them. This is a deliberate deviation from
 * TRD §5 ("CTE traversal") — reported to Levi. At this scale it is simpler and
 * exact; revisit if the node count approaches the viz ceiling.
 */

export type EdgeType = "explicit" | "co_tag" | "replicated_from";

export type GraphFilter = {
  region?: string[];
  segment?: string[];
  pillar?: string[];
};

export type GraphNode = {
  id: number;
  title: string;
  region: string;
  segment: string;
  pillar: string;
  stage: string;
};

export type GraphEdge = {
  srcId: number;
  dstId: number;
  type: EdgeType;
  sharedTags?: string[];
};

// Tags too broad to imply a real relationship; excluded from co_tag derivation.
const GENERIC_TAGS = new Set(["", "all", "general", "other", "misc", "n/a"]);

export class SelfLinkError extends Error {
  constructor() {
    super("An initiative cannot be linked to itself.");
    this.name = "SelfLinkError";
  }
}
export class DuplicateLinkError extends Error {
  constructor() {
    super("That link already exists.");
    this.name = "DuplicateLinkError";
  }
}

function normTags(tags: string[] | null): string[] {
  if (!tags) return [];
  const out = new Set<string>();
  for (const raw of tags) {
    const t = raw.trim().toLowerCase();
    if (t && !GENERIC_TAGS.has(t)) out.add(t);
  }
  return [...out];
}

// ── Explicit edge CRUD (admin) ──────────────────────────────────────────────

/** Create a directed explicit edge src→dst. Guards self-link + duplicate. */
export async function createExplicitLink(
  srcId: number,
  dstId: number,
  actorId: number,
): Promise<number> {
  if (srcId === dstId) throw new SelfLinkError();
  return db.transaction(async (tx) => {
    const [dup] = await tx
      .select({ id: initiativeLinks.id })
      .from(initiativeLinks)
      .where(
        and(
          eq(initiativeLinks.srcId, srcId),
          eq(initiativeLinks.dstId, dstId),
          eq(initiativeLinks.type, "explicit"),
        ),
      )
      .limit(1);
    if (dup) throw new DuplicateLinkError();
    const [row] = await tx
      .insert(initiativeLinks)
      .values({ srcId, dstId, type: "explicit", createdBy: actorId })
      .returning({ id: initiativeLinks.id });
    return row.id;
  });
}

/** Delete an explicit edge by its id. Derived edges have no id and can't be deleted. */
export async function deleteExplicitLink(id: number): Promise<void> {
  await db
    .delete(initiativeLinks)
    .where(and(eq(initiativeLinks.id, id), eq(initiativeLinks.type, "explicit")));
}

/** Delete the explicit edge between two initiatives, in either direction. */
export async function deleteExplicitBetween(a: number, b: number): Promise<void> {
  await db
    .delete(initiativeLinks)
    .where(
      and(
        eq(initiativeLinks.type, "explicit"),
        sql`((src_id = ${a} AND dst_id = ${b}) OR (src_id = ${b} AND dst_id = ${a}))`,
      ),
    );
}

// ── Graph construction (explicit + derived) ─────────────────────────────────

type NodeRow = GraphNode & { tags: string[] | null; replicatedFrom: number | null };

async function loadNodes(filter?: GraphFilter): Promise<NodeRow[]> {
  const conds = [];
  if (filter?.region?.length)
    conds.push(inArray(initiatives.region, filter.region as never[]));
  if (filter?.segment?.length)
    conds.push(inArray(initiatives.segment, filter.segment as never[]));
  if (filter?.pillar?.length)
    conds.push(inArray(initiatives.pillar, filter.pillar as never[]));
  const rows = await db
    .select({
      id: initiatives.id,
      title: initiatives.title,
      region: initiatives.region,
      segment: initiatives.segment,
      pillar: initiatives.pillar,
      stage: initiatives.stage,
      tags: initiatives.tags,
      replicatedFrom: initiatives.replicatedFrom,
    })
    .from(initiatives)
    .where(conds.length ? and(...conds) : undefined);
  return rows;
}

/**
 * Build the full graph (nodes + all three edge kinds) over the filtered set.
 * Edges only connect nodes that are both present in the filtered set.
 */
export async function buildGraph(
  filter?: GraphFilter,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const rows = await loadNodes(filter);
  const present = new Set(rows.map((r) => r.id));
  const edges: GraphEdge[] = [];

  // Explicit edges (stored), restricted to the filtered node set.
  const explicit = await db
    .select({ srcId: initiativeLinks.srcId, dstId: initiativeLinks.dstId })
    .from(initiativeLinks)
    .where(eq(initiativeLinks.type, "explicit"));
  for (const e of explicit) {
    if (present.has(e.srcId) && present.has(e.dstId)) {
      edges.push({ srcId: e.srcId, dstId: e.dstId, type: "explicit" });
    }
  }

  // replicated_from (derived from the self-FK): id → its source.
  for (const r of rows) {
    if (r.replicatedFrom && present.has(r.replicatedFrom)) {
      edges.push({ srcId: r.id, dstId: r.replicatedFrom, type: "replicated_from" });
    }
  }

  // co_tag (derived, symmetric): one edge per pair sharing ≥1 non-generic tag.
  const byTag = new Map<string, number[]>();
  for (const r of rows) {
    for (const t of normTags(r.tags)) {
      const list = byTag.get(t) ?? [];
      list.push(r.id);
      byTag.set(t, list);
    }
  }
  const pairShared = new Map<string, Set<string>>();
  for (const [tag, members] of byTag) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = Math.min(members[i], members[j]);
        const b = Math.max(members[i], members[j]);
        const key = `${a}|${b}`;
        const set = pairShared.get(key) ?? new Set<string>();
        set.add(tag);
        pairShared.set(key, set);
      }
    }
  }
  for (const [key, tags] of pairShared) {
    const [a, b] = key.split("|").map(Number);
    edges.push({ srcId: a, dstId: b, type: "co_tag", sharedTags: [...tags].sort() });
  }

  const nodes: GraphNode[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    region: r.region,
    segment: r.segment,
    pillar: r.pillar,
    stage: r.stage,
  }));
  return { nodes, edges };
}

// ── Per-initiative queries (for the detail panel) ───────────────────────────

export type RelatedItem = {
  node: GraphNode;
  type: EdgeType;
  direction: "forward" | "backward" | "undirected";
  sharedTags?: string[];
};

/** Everything related to one initiative, grouped for the detail panel. */
export async function relatedInitiatives(id: number): Promise<RelatedItem[]> {
  const { nodes, edges } = await buildGraph();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const items: RelatedItem[] = [];
  for (const e of edges) {
    if (e.type === "co_tag") {
      if (e.srcId === id || e.dstId === id) {
        const otherId = e.srcId === id ? e.dstId : e.srcId;
        const node = byId.get(otherId);
        if (node) items.push({ node, type: "co_tag", direction: "undirected", sharedTags: e.sharedTags });
      }
      continue;
    }
    // explicit + replicated_from are directed.
    if (e.srcId === id) {
      const node = byId.get(e.dstId);
      if (node) items.push({ node, type: e.type, direction: "forward" });
    } else if (e.dstId === id) {
      const node = byId.get(e.srcId);
      if (node) items.push({ node, type: e.type, direction: "backward" });
    }
  }
  return items;
}

/** Explicit forward links: dst ids where an explicit edge starts at srcId. */
export async function forwardLinks(srcId: number): Promise<number[]> {
  const rows = await db
    .select({ dstId: initiativeLinks.dstId })
    .from(initiativeLinks)
    .where(and(eq(initiativeLinks.srcId, srcId), eq(initiativeLinks.type, "explicit")));
  return rows.map((r) => r.dstId);
}

/** Explicit backlinks: src ids where an explicit edge ends at dstId. */
export async function backlinks(dstId: number): Promise<number[]> {
  const rows = await db
    .select({ srcId: initiativeLinks.srcId })
    .from(initiativeLinks)
    .where(and(eq(initiativeLinks.dstId, dstId), eq(initiativeLinks.type, "explicit")));
  return rows.map((r) => r.srcId);
}

/** Neighbors within 2 hops (over ALL edge kinds, undirected), excluding self. */
export async function neighbors2hop(id: number): Promise<number[]> {
  const { edges } = await buildGraph();
  const adj = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  for (const e of edges) link(e.srcId, e.dstId);
  const seen = new Set<number>([id]);
  let frontier = [id];
  for (let hop = 0; hop < 2; hop++) {
    const next: number[] = [];
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
  seen.delete(id);
  return [...seen].sort((a, b) => a - b);
}

/**
 * The 1–2 hop ego subgraph around one initiative: the node, its neighbors, and
 * the edges among that set. For the detail-page ego graph (T11).
 */
export async function egoGraph(
  id: number,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const { nodes, edges } = await buildGraph();
  const adj = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  for (const e of edges) link(e.srcId, e.dstId);

  const inSet = new Set<number>([id]);
  let frontier = [id];
  for (let hop = 0; hop < 2; hop++) {
    const next: number[] = [];
    for (const n of frontier) {
      for (const m of adj.get(n) ?? []) {
        if (!inSet.has(m)) {
          inSet.add(m);
          next.push(m);
        }
      }
    }
    frontier = next;
  }
  return {
    nodes: nodes.filter((n) => inSet.has(n.id)),
    edges: edges.filter((e) => inSet.has(e.srcId) && inSet.has(e.dstId)),
  };
}

/** Initiatives with no edge of any kind (explicit, co_tag, or replicated_from). */
export async function orphanIds(): Promise<number[]> {
  const { nodes, edges } = await buildGraph();
  const connected = new Set<number>();
  for (const e of edges) {
    connected.add(e.srcId);
    connected.add(e.dstId);
  }
  return nodes
    .map((n) => n.id)
    .filter((id) => !connected.has(id))
    .sort((a, b) => a - b);
}
