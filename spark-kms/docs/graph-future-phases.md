---
doc_id: DESIGN-2026-010
doc_type: design-proposal
project: kms-spark
systems: [kms-spark, postgresql]
status: draft
owner: levi
last_verified: 2026-07-22
related: [docs/prd-graph-tracking.md, docs/trd-graph-tracking.md]
---

# From an initiative graph to a knowledge graph (future phases)

Phase 7 shipped an **initiative-to-initiative** graph: nodes are initiatives,
edges are shared-tags / explicit-links / replicated-from. This doc sketches the
two additive steps that turn it into the "link all the knowledge together"
vision — a decision aid, not an approved plan. Provenance: `[S: path]`
source-confirmed from real code, `[A]` assumed / needs a decision.

## Where we are today

- Nodes: **initiatives** only. `[S: src/services/links.ts]`
- Edges: `explicit` (admin), `co_tag` (shared `initiatives.tags[]`), `replicated_from` (the self-FK). `[S: src/db/schema.ts]`
- The "knowledge" around an initiative — its **tags, PIC, pillar, region, segment, action items, scores** — are *attributes*, not nodes you can walk to. Tags connect two initiatives, but you can't click a tag and see everything under it, or click a person and traverse everything they touched.

Two things already in the schema make the next steps cheap:
- `initiative_links.type` already includes `derived_similar`, and there is a `weight` column — both **reserved and unused**, exactly for Phase 2 AI links. `[S: src/db/schema.ts]`
- A `people` table exists (the v1.2 PIC directory). But `initiatives.pic` and `action_items.pic` are **free text**, not foreign keys to it. `[S: src/db/schema.ts:139,206]`

---

## Part 1 — Multi-entity knowledge graph (breadth)

Promote the connectors to **first-class nodes**, so you traverse across entity
types, not just between initiatives.

### Node types
| Node | Source today | Change needed |
|---|---|---|
| Initiative | `initiatives` | none |
| Person (PIC) | `people` table exists; `pic` is free text `[S]` | resolve `pic` → `people.id` (FK, or match-by-name) |
| Tag / Theme | `initiatives.tags[]` (strings) `[S]` | a `tags` table + `initiative_tags` join, so a tag is canonical (with synonyms) |
| Pillar / Region / Segment | enums `[S]` | optional: treat as reference nodes for grouping |
| Action item | `action_items` (has `initiative_id`, `pic`) `[S]` | none; already linked |

### Edges the fuller graph carries
```
(Person) —RAN→ (Initiative) —TAGGED→ (Tag)
(Person) —ASSIGNED→ (Action item) —BELONGS_TO→ (Initiative)
(Initiative) —IN_PILLAR / IN_REGION / IN_SEGMENT→ (reference node)
(Initiative) —LINKED / REPLICATED_FROM→ (Initiative)     ← already built
```

### What it unlocks
- **"Everything Sri has touched"** — Person → RAN → Initiatives → their tags, regions, scores, open action items.
- **"Who else works on pop-ups?"** — Tag «pop-up» → Initiatives → the people who ran them.
- **"Themes that span Sumatera and CJWJ"** — Region nodes → Initiatives → shared Tags (the intersection).
- **Person and Tag hub pages** — click a person or a theme and see its whole neighborhood, not just one initiative at a time.

### What it takes
1. **Schema (additive):** a `tags` table + `initiative_tags` join; resolve `pic` to `people` (backfill by name); keep typed join tables and add a **projection service** that unions them into a `{nodes, edges}` shape. `[A: prefer typed tables + projection over one polymorphic edge table — keeps FKs and is simpler at this scale]`
2. **Services:** generalize `buildGraph()` in `links.ts` to emit multiple node types; the current in-memory build pattern already generalizes. `[S: src/services/links.ts]`
3. **UI:** `/graph` gains node-type color/shape + a type filter; add Person and Tag hub pages.
4. **Effort:** ~2–3 sprints. `[A: AI-estimated]`
5. **Main risk — hairball.** People and tags are high-degree hubs, so the global view gets noisy. Mitigation: focus-node mode (expand from one node), cap displayed neighbors, hide generic tags. This is the same over-connection risk the TRD flagged for co-tag, amplified. `[S: trd-graph-tracking.md §8]`

**Dependencies:** none external. Builds on `initiative_links`, `people`, `action_items`, `initiatives.tags`. No change to scoring.

---

## Part 2 — AI-discovered links (depth)

Co-tag only connects initiatives that used the **same word**. Two write-ups of
the same idea in different words ("pop-up" vs "temporary store activation"), or
in Indonesian vs English, stay disconnected. Semantic links close that gap.

### How it works
1. **Embed** each initiative (title + description + entries) into a vector via an embedding model. `[A: model + vendor undecided — Claude/OpenAI/local; cost per initiative to confirm]`
2. **Store** the vector with **pgvector**. `[V: pgvector 0.8.2 available + installed on the production Lightsail Postgres, verified 2026-07-22]`
3. **Compare** by cosine similarity → candidate edges of type `derived_similar`, with the similarity as `weight`. Both the type and the column already exist, unused. `[S: src/db/schema.ts]`
4. **Human-confirm, never auto-merge** — a suggestion an admin accepts (→ a real edge) or dismisses, reusing the existing duplicate-review pattern. `[S: src/services/duplicates.ts, components/bulk-upload.tsx]`

### What it unlocks
- Connections across different vocabulary, language, and region.
- "Find similar initiatives" even when nobody tagged them — the graph stops depending on people tagging consistently.

### What it takes
1. ~~**Confirm pgvector**~~ **DONE** — pgvector 0.8.2 available + installed on production. `[V: verified 2026-07-22]`
2. **Embedding pipeline** — compute + store on create/append (async job). No LLM/vector dependency exists in the app yet, so this is net-new. `[S: package.json — none installed]`
3. **Candidate generation** — nightly or on-demand similarity query above a threshold.
4. **Admin confirm UI** — reuse the dedup-review component.
5. **Effort:** ~2 sprints, gated on pgvector + the model decision. `[A: AI-estimated]`
6. **Risks:** per-initiative embedding cost; false positives (mitigated by threshold + human confirm); vendor lock-in on the model.

**The schema is already prepared** — `derived_similar` + `weight` mean Phase 2 needs no migration to the edge model. `[S: src/db/schema.ts]`

---

## How the two compose

- **Part 1 = breadth** (more node types, more traversals) — no external dependency, immediate value from data you already hold.
- **Part 2 = depth** (better initiative-to-initiative links) — needs pgvector + a model decision.

They're independent; either can go first. **Recommendation: Part 1 first** (self-contained, uses existing data, no vendor call), then Part 2 once pgvector (O2) and the embedding model are settled.

## Open questions to close before either is approved
| # | Question | Owner |
|---|---|---|
| G1 | Is the target the full entity graph, or is initiative-to-initiative enough for now? | Levi |
| G2 | Canonical tags — controlled vocabulary, or free tags with synonym-merging? | Levi |
| ~~G3~~ | ~~pgvector availability on the Lightsail Postgres (O2)~~ — **RESOLVED: pgvector 0.8.2 available + installed, 2026-07-22** | Eng/IT |
| G4 | Embedding model + vendor + cost per initiative | Levi + Eng |
| G5 | Does linking people-as-nodes reopen the tracking/privacy concern (a person's full activity is now one click)? | Levi + IT/HR |
