---
doc_id: TRD-2026-011
doc_type: trd
project: kms-spark
systems: [kms-spark, postgresql]
vendors: []
status: draft
owner: levi
engineer_signoff: null
last_verified: 2026-07-22
related: [docs/graph-future-phases.md, docs/trd-graph-tracking.md]
---

# TRD: multi-entity knowledge graph (KMS Spark, "Part 1")

Tier: Lite (one system, no external vendor). Turns the shipped
initiative-to-initiative graph into a **full entity graph**: people, tags, and
the pillar/region/segment dimensions become first-class nodes you can traverse.
Provenance: `[S: path]` source-confirmed, `[A]` assumed / decision.

## Basics

| | |
|---|---|
| Author | Levi (PM) |
| Signs the Design section | Levi (acting technical owner) |
| Reviewers | [OPEN — name eng reviewer, owner Levi, before In Review] |
| Decisions (from graph-future-phases G1–G5) | G1 full entity graph; G2 **free tags** (revisit canonical later); G5 People **in scope** — the graph links knowledge-base content only, not PII, so it is not employee monitoring `[V: Levi]` |

## Systems & terms

- **KMS Spark**: the Next.js 16 initiative KB. `[S: package.json]`
- **Entity graph**: a graph whose nodes are multiple entity types (initiative, person, tag, …), not just initiatives.
- **Node ref**: a namespaced id `"<type>:<id>"` (e.g. `person:3`, `tag:5`) so ids don't collide across types.
- **Hub page**: a page for one person or tag listing everything connected to it.
- **initiative_links**: the existing edge table (initiative→initiative). `[S: src/db/schema.ts]`
- **people**: the v1.2 PIC directory (names, not logins). `initiatives.pic` / `action_items.pic` are **free text**, not FKs to it. `[S: src/db/schema.ts:139,206]`

## 1. Summary (target 120w)

Today the graph has one node type (initiative). This makes the connectors —
**people, tags, and pillar/region/segment** — into nodes too, so you can
traverse across them: "everything Sri ran", "who else works on pop-ups",
"themes spanning two regions". Tags get a real `tags` table + join (free tags,
created on use); each initiative's PIC resolves to a `people` row via a new FK;
pillar/region/segment stay virtual nodes derived from the existing enums. A
projection service unions these into a typed `{nodes, edges}` graph reusing the
Phase-7 in-memory build. The explorer gains node types + a type filter, plus
person and tag hub pages. All additive; no scoring change; no external vendor.

## 2. Background (target 150w)

Phase 7 shipped `initiative_links` and an in-memory `buildGraph()` over
initiatives, with edges for explicit links, shared tags, and replicated-from.
`[S: src/services/links.ts]` The "knowledge" around an initiative already
exists as structured data — `tags[]`, `pic`, `pillar`/`region`/`segment` enums,
and `action_items` — but only as attributes, not traversable nodes. `[S:
src/db/schema.ts]` So you can't click a person and see their initiatives, or a
theme and see who works on it. This TRD promotes those attributes to nodes. Two
schema hooks make it cheap: the `people` table already exists (v1.2), and the
graph projection pattern already generalizes. Decisions are set (Basics): full
entity graph, free tags, people in scope (knowledge links, not PII).

## 3. Goals & non-goals (target 150w)

Goals: (1) model people, tags, and pillar/region/segment as graph nodes; (2)
traverse across types — person→initiatives, tag→initiatives, region→themes; (3)
person and tag **hub pages**; (4) the explorer shows node types with a type
filter; (5) all additive — backfilled from existing data, no scoring change.

Non-goals (this phase): AI-discovered links (that is Part 2 / pgvector);
canonical tag vocabulary or synonym-merging (G2 deferred — free tags now); graph
analytics (centrality, community detection); making `action_items` nodes
(stretch, section 7); editing the graph by dragging; historical/temporal graph.

## 4. Requirements (target 200w)

Functional. **Tags:** a `tags` table + `initiative_tags` join; a tag is created
on first use (free tags, like `people.upsertByName`); Submit/edit writes tags
through the join; backfill from `initiatives.tags[]`. **People:** add
`initiatives.pic_person_id` (FK → people), backfilled by resolving `pic` via
`upsertByName`; new PICs create a people row. **Nodes:** initiative, person,
tag, and virtual pillar/region/segment (from enums). **Edges:** person RAN
initiative; initiative TAGGED tag; initiative IN_PILLAR/IN_REGION/IN_SEGMENT;
plus the existing LINKED and REPLICATED_FROM. **Queries:** neighbors of a node
ref (depth ≤2), person→initiatives, tag→initiatives, and a filtered global
graph. **UI:** explorer with node-type colour + type filter; person hub
(`/people/[id]`) and tag hub (`/tags/[slug]`); the detail related-panel gains
person/tag connections.

Speed. Global projection stays in memory at our scale (<3k initiatives, low
thousands of nodes). `[A]` Cap displayed neighbors to avoid hub hairballs.

Scale. Node count grows with people + distinct tags; still low thousands. `[A]`

Security/privacy. Same session gate (`proxy.ts`, guards). `[S: proxy.ts]` Graph
content is knowledge-base data, not PII; person nodes are names already shown on
initiatives, so no new exposure `[V: Levi, G5]`. Writes (tags, links) stay
admin-gated.

## 5. Design (target 300w)

**Schema (additive).** New `tags(id, name, created_at)` with a lower-unique
index (mirrors `people`). New `initiative_tags(initiative_id, tag_id)` join,
unique per pair. New nullable column `initiatives.pic_person_id → people.id`.
Nothing dropped: `initiatives.tags[]` stays as a mirror during transition (the
list-page tag filter still reads it) and is deprecated once the join is the
source of truth. `[A]`

**Node refs.** The projection namespaces ids: `initiative:<id>`, `person:<id>`,
`tag:<id>`, `pillar:<name>`, `region:<name>`, `segment:<name>`. This lets one
graph hold heterogeneous nodes without id collisions.

**Projection service** (`src/services/graph.ts`, generalizing `links.ts`):
loads initiatives (+ pic_person_id, tags via join), people, and derives the
typed node/edge set in memory, exactly like Phase-7 `buildGraph`. `[S:
src/services/links.ts]`

```
 (person:3) ──RAN──▶ (initiative:12) ──TAGGED──▶ (tag:5 "pop-up")
                          │  ▲                         ▲
             IN_REGION    │  └──REPLICATED_FROM──(initiative:40)
                          ▼                              │
                   (region:Sumatera)          TAGGED─────┘
```

**Backfill (one-shot, idempotent scripts, like the v1.2 migration runners):**
(a) for each distinct non-generic value in `tags[]`, upsert a tag and populate
`initiative_tags`; (b) for each initiative, `upsertByName(pic)` → set
`pic_person_id`. `[S: src/services/people.ts upsertByName]`

**Reads.** `personInitiatives(id)`, `tagInitiatives(id)`,
`neighbors(nodeRef, depth)`, and `buildEntityGraph(filter)` returning typed
`{nodes, edges}`. The Phase-7 `/api/graph` grows a `types` param; new
`/api/people/[id]/graph` and `/api/tags/[id]/graph` for hubs.

**UI.** `GraphCanvas` gains per-type colour/shape + a node-type legend and
filter; clicking a person/tag node opens its hub. Person hub lists their
initiatives (+ open action items, scores); tag hub lists initiatives + adjacent
tags. The detail related-panel adds "People" and "Themes" groups.

Edge cases: an initiative whose `pic` matches no clean name still creates a
person (free, like tags); a tag used once is still a node (may be an orphandash
hub); deleting an initiative cascades its `initiative_tags`. `[A]`

## 6. Other options considered (target 150w)

**One polymorphic `graph_edges(src_type, src_id, dst_type, dst_id)` table:**
rejected. It drops foreign keys and type safety for a uniformity we don't need
at this scale; typed join tables + a projection keep referential integrity.
`[A]`

**Keep tags as `text[]` only (no table):** rejected. Without a tag row you
can't give a tag an identity, a hub page, or (later) synonyms; the array stays
only as a transition mirror. `[A]`

**A real graph database (Neo4j/AGE):** rejected, same as Phase 7 — index-free
adjacency buys nothing below ~10^5 nodes and adds a datastore to run. `[S:
trd-graph-tracking.md §6]`

**Make pic a hard FK (not null) immediately:** rejected. Historical `pic`
strings are messy; a nullable FK + backfill is safer and reversible. `[A]`

## 7. How it ships & how we undo it (target 200w)

Rollout, behind the existing `graph` flag. Order: (1) `tags` + `initiative_tags`
+ `pic_person_id` schema; (2) backfill scripts; (3) projection service +
queries; (4) hub pages + explorer node types; (5) wire Submit/edit to write tags
through the join. Deploy alongside the current app; migrations additive (new
tables + one nullable column), so they apply without touching existing rows.
`[A]` `action_items`-as-nodes is a **stretch** — include only if step 3 lands
early.

Testing. Backfill: tags/people counts match the source; idempotent on re-run.
Projection: person→initiatives, tag→initiatives, neighbors(depth), type filter
each return the expected set on a fixture. UI: explorer renders multiple node
types; a person node opens the hub. Reuse Vitest + the Phase-7 `links.test`
fixture style. `[S: tests/integration/links.test.ts]`

Rollback. New tables + one nullable column, all behind the flag. Undo = drop
`tags`, `initiative_tags`, and the `pic_person_id` column; `initiatives.tags[]`
was never removed, so the list page and existing graph keep working. Non-
destructive. `[A]`

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hub hairball (a prolific PIC / generic tag has huge degree) | High | Med | Focus-node mode (expand from one node), cap displayed neighbors, hide generic tags `[A]` |
| PIC backfill mis-merges or splits people (typos, aliases) | Med | Med | Case-insensitive match via `upsertByName`; report unmatched; manual merge later `[S: people.ts]` |
| Free-tag noise (near-duplicate tags) | Med | Low | Accepted for now (G2); canonical vocab is the deferred revisit |
| tags[] and the join drift during transition | Med | Low | Submit writes both until the array is deprecated; a check test asserts parity |
| Scope creep into analytics/AI | Med | Med | Non-goals fixed; AI links are Part 2 |

## 9. Plan & timeline

| Milestone | Scope | Est. `[A: AI-estimated]` |
|---|---|---|
| M1 Schema + backfill | tags, initiative_tags, pic_person_id, backfill scripts | ~1 sprint |
| M2 Projection + queries | graph.ts, person/tag/neighbors, API params | ~1 sprint |
| M3 Hub pages + explorer | person/tag hubs, node-type explorer + filter | ~1 sprint |
| M4 Write path | Submit/edit write tags through the join; deprecate tags[] | ~0.5 sprint |

## 10. Open questions

| # | Question | Owner | Needed by |
|---|---|---|---|
| E1 | Named engineer to verify Design ([A]→[V]) | Levi | before In Review |
| E2 | Are `action_items` nodes in scope, or a later stretch? | Levi | M2 |
| E3 | When to drop `initiatives.tags[]` (after which UI reads the join)? | Eng | M4 |
| E4 | Hub-page scope: standalone routes vs panels on existing pages | Levi | M3 |

---

## Provenance appendix

Design `[A]` tags to resolve before Approved: in-memory projection at scale;
tags[] mirror-then-deprecate; polymorphic-table rejection; nullable-FK backfill;
hairball/backfill mitigations. `[V]` set: G1/G2/G5 decisions.
