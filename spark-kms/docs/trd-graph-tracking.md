---
doc_id: TRD-2026-009
doc_type: trd
project: kms-spark
systems: [kms-spark, postgresql]
vendors: []
status: draft
owner: levi
engineer_signoff: null   # Levi acts as signer; set to "levi" only when Design [A] tags are resolved to [V]
last_verified: 2026-07-22
supersedes: null
related: [docs/prd-graph-tracking.md, docs/research-graph-tracking.md]
---

# TRD: knowledge graph + usage tracking (KMS Spark, Phase 1)

Tier: Lite (one system, no external vendor). This doc is a proposal until the signer resolves the Design `[A]` tags to `[V]`. Provenance on every Design claim: `[V: name]` engineer-verified, `[S: path]` source-confirmed from real code, `[A]` assumed.

## Basics

| | |
|---|---|
| Author | Levi (PM) |
| Signs the Design section | Levi (acting technical owner). An engineer verifier is not yet assigned. |
| Reviewers | [OPEN — name eng reviewer(s), owner Levi, needed before In Review] |

## Systems & terms

- **KMS Spark**: the internal initiative knowledge base. Next.js 16 app in `spark-kms/`. `[S: package.json]`
- **PostgreSQL**: the app's only datastore, hosted on AWS alongside existing ParagonCorp capability. `[A: AWS RDS, confirm instance]`
- **Initiative**: one topic/theme record; the graph's node.
- **Edge**: a relation between two initiatives (explicit, co-tag, or replicated-from).
- **usage_events**: new append-only table of page views and clicks.
- **pg_trgm**: Postgres trigram extension, already used for fuzzy title matching. `[S: src/services/duplicates.ts]`
- **pgvector**: Postgres vector extension, Phase 2 only.
- **data-track**: an HTML attribute marking an element as click-tracked.

## 1. Summary (target 120w)

Add two features to KMS Spark. A knowledge graph makes initiative relationships visible: a new edge table stores explicit links, co-tag links derived from existing tags, and the currently-unused replicated-from link. Viewers see related initiatives on the detail page and in a graph explorer. Usage tracking captures page views and marked clicks into an append-only table, feeding an owner dashboard that answers four questions: top pages, own frequency, top clicks, and trends. Identity is pseudonymized; raw events expire at 90 days. Both reuse existing app patterns and the Postgres we already run. Phase 2 (reserved, not built here): AI-suggested relations and click heatmaps.

## 2. Background (target 150w)

KMS Spark stores initiatives but reads none of the relationships between them. The schema already carries `initiatives.tags` (written, never read) and `initiatives.replicated_from` (a self-FK referenced nowhere). `[S: src/db/schema.ts:140-141]` So the reuse the KMS exists for stays manual. Separately, the app captures zero usage data: no analytics library, event table, or click logging exists. `[S: repo-wide search, no instrumentation.ts]` We are about to ship a graph feature with no way to measure its adoption. This TRD covers Phase 1: activate the latent graph hooks behind a real edge model and UI, and stand up a minimal in-house tracking pipeline. Decisions are set (PRD section: decisions applied): all three edge types, pseudonymized identity, build tracking in-house, Phase 2 reserves AI relations and heatmaps.

## 3. Goals & non-goals (target 150w)

Goals: (1) store and query initiative-to-initiative edges; (2) show related initiatives on the detail page and a filterable global explorer, viewer-facing; (3) capture page views and marked clicks with no PII; (4) answer the four usage questions on an owner dashboard; (5) instrument before we judge, so 14 days of baseline exist before graph adoption is reported.

Non-goals (Phase 1): no click heatmaps; no AI-suggested relations; no session replay; no tracking of keystrokes, form values, or mouse trails; no per-named-employee dashboards; no graph analytics algorithms (centrality, clustering); no admin CRUD for edge types. Phase 2 reserves AI relations (pgvector) and heatmaps; the schema leaves room so neither needs a later migration to the edge model.

## 4. Requirements (target 200w)

Functional. Edges: create/delete explicit edges (admin); derive co-tag edges automatically from shared tags; expose replicated-from as an edge. Queries: backlinks, forward links, 2-hop neighbors, orphan nodes. UI: detail-page related panel (list + ego graph), `/graph` explorer with region/segment/pillar filters and orphan highlighting, viewer-facing. Tracking: client emitter sends page views (route change) and clicks on `data-track` elements; ingest endpoint validates and stores; dashboard renders the four questions.

Speed. Detail-page related panel adds under 150ms server time at our scale. `[A]` Graph traversal capped at 2 hops in Phase 1.

Scale. Hundreds to low-thousands of initiatives over 2 years; edge table stays small. `[A: node count <3,000]` `usage_events` is write-heavy; batch inserts, roll up nightly, drop raw rows at 90 days.

Security/privacy. Reuse the existing session gate (`proxy.ts`) and guards. `[S: proxy.ts, src/lib/guards.ts]` No PII columns in `usage_events`. Identity pseudonymized (keyed hash). No per-named-employee view. Employee privacy notice required before launch. Retention: 90 days raw, aggregates longer.

## 5. Design (target 300w)

Storage adds two tables. Edges live in `initiative_links` (adjacency/edge list) in the existing Postgres; a graph database is not justified at this scale. `[S: research §2]` Usage lives in `usage_events`, append-only, mirroring the `score_events` ledger pattern. `[S: src/services/scoring.ts]`

```
 Browser                         KMS Spark (Next.js/AWS)          PostgreSQL
 ┌──────────────┐   route change  ┌───────────────────┐  insert   ┌──────────────┐
 │ useUsage     │─page_view──────▶│ POST /api/events  │──batch───▶│ usage_events │
 │ Tracking     │─click(data-     │ (Zod validate)    │           │ (append-only)│
 │ (sendBeacon) │  track)────────▶│                   │           └──────┬───────┘
 └──────────────┘                 │                   │   nightly rollup  ▼
 ┌──────────────┐   read          │ /api/dashboard    │◀──────────  usage_daily
 │ Detail page  │─related────────▶│ graph services    │  read     ┌──────────────┐
 │ /graph       │◀────nodes/edges─│ (CTE traversal)   │◀─────────▶│initiative_   │
 └──────────────┘                 └───────────────────┘           │links + tags  │
                                                                   └──────────────┘
```

Data:

| Table | Key columns | Notes |
|---|---|---|
| initiative_links | src_id, dst_id, type(explicit\|co_tag\|replicated_from\|derived_similar), weight, created_by | unique(src,dst,type); `derived_similar`+`weight` reserved for Phase 2 `[A]` |
| usage_events | event_type, route_pattern, element_id, session_id, actor_hash, ts, viewport, click_x/y_norm | no PII; indexes on route_pattern, ts, element_id `[S: research §5]` |
| usage_daily | day, route_pattern, event_type, count | nightly rollup; survives raw-row deletion |

Interfaces (new): `POST /api/events` (batch ingest, session-gated); `GET/POST/DELETE /api/initiatives/[id]/links` (admin for writes); `GET /api/graph` (nodes+edges, filtered); `GET /api/dashboard/usage` (four aggregates). Co-tag edges are computed from `tags[]`, not stored twice; a shared-tag change updates them. `[A]`

Edge cases: initiative with no edges (orphan, empty state not error); self-link rejected; deleting an initiative cascades its edges; a click on an element with no `data-track` is ignored; a malformed event batch is dropped, not 500'd; backdated/duplicate events deduped by (session, ts, element). `[A]`

## 6. Other options considered (target 150w)

Graph database (Neo4j/AGE): rejected. Index-free adjacency buys nothing below ~10^5 nodes and adds a datastore to run and sync. `[S: research §2]` Apache AGE keeps it in Postgres but adds an extension and Cypher for little gain at our scale.

Full analytics suite (self-hosted PostHog): rejected for Phase 1. It bundles heatmaps, replay, and flags, but is a new service to secure and heavier than four questions need. Reconsidered only if scope grows. `[S: research §11]`

Track every click (no `data-track`): rejected. Higher noise and privacy risk; opt-in per element is cheaper and safer.

Fully anonymous tracking: rejected. It would kill the "how often do I access" question. Pseudonymized with no cross-person views chosen instead. `[S: PRD decision]`

WebGL graph (Sigma.js): deferred. Overkill until ~10k visible nodes; react-force-graph fits now. `[S: research §3]`

## 7. How it ships & how we undo it (target 200w)

Rollout. Ship tracking first or with the graph so adoption is measurable from day 1. `[S: PRD §7]` Order: (1) `usage_events` + `/api/events` + emitter, behind a flag; (2) `initiative_links` + backlinks list; (3) graph explorer + ego graph; (4) usage dashboard. Deploy to AWS alongside existing capability. `[A: AWS RDS + app host]` Migrations are additive (two new tables, no changes to existing tables), so they apply without touching current data.

Testing. Tracking ingest gets contract tests (valid batch stored, malformed dropped, no PII column populated). Graph queries get logic tests (backlinks, 2-hop, orphan, self-link rejected, cascade on delete). UI gets one interaction test each (related panel opens a node; a `data-track` click emits one event). Reuse Vitest + Playwright already configured. `[S: package.json]`

Rollback. Both features sit behind a feature flag and on new tables only. Disable the flag to hide UI and stop emission. Full undo drops `initiative_links`, `usage_events`, `usage_daily`; existing tables and scores are untouched, so rollback is non-destructive. `[A]` The retention job (90-day delete) ships with the tracking migration, not after. `[A: cron mechanism on AWS TBD]`

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tracking reads as employee surveillance | Med | High | Pseudonymized IDs, no per-person views, privacy notice + DPIA before launch, 90-day retention |
| Co-tag edges create a hairball (over-connection) | Med | Med | Cap displayed neighbors, weight by shared-tag count, hide generic tags `[A]` |
| Graph shipped, nobody uses it | Med | Med | Instrument first; report adoption at 30 days against a target |
| Heatmap ROI weak on a 6-page tool | High | Low | Kept in Phase 2; Q7 asks whether to build it at all |
| pgvector unavailable on chosen AWS Postgres | Low | Med (Phase 2 only) | Confirm RDS version before Phase 2; edge table already reserves the type |
| `data-track` coverage incomplete → click metric gaps | Med | Low | Name the priority elements (Q2) during build |

## 9. Plan & timeline

| Milestone | Scope | Est. `[A: AI-estimated]` |
|---|---|---|
| M1 Tracking pipeline | usage_events, /api/events, emitter, retention job | ~1 sprint |
| M2 Graph data | initiative_links, co-tag derivation, activate replicated_from, backlinks | ~1 sprint |
| M3 Graph UI | detail related panel + ego graph, /graph explorer (react-force-graph) | ~1 sprint |
| M4 Usage dashboard | four aggregates in recharts, date range | ~0.5 sprint |
| Baseline gate | 14 days of usage data before graph adoption is judged | elapsed time |

## 10. Open questions

| # | Question | Owner | Needed by |
|---|---|---|---|
| O1 | Named engineer to verify Design (convert [A]→[V]) | Levi | before In Review |
| O2 | AWS Postgres instance + pgvector version | Eng/IT | before Phase 2 |
| O3 | Which elements get `data-track` (click coverage) | Levi + eng | M1 |
| O4 | Retention cron mechanism on AWS (pg_cron vs app scheduler) | Eng | M1 |
| O5 | Privacy notice + DPIA sign-off owner | Levi + IT/HR | before tracking launch |
| O6 | Node-count ceiling at 12/24 months (viz sizing) | Levi | M3 |
| O7 | Success-metric targets (60%/20%) confirmation | Levi | baseline gate |

---

## Provenance appendix (chase these before Approved)

This TRD cannot reach Approved while any `[A]` remains in section 5 (Design). Current tags to resolve:

Design `[A]` tags: related-panel latency budget; node-count assumption (<3,000); `derived_similar`+`weight` Phase 2 reservation; co-tag recompute-on-tag-change behavior; ingest dedup by (session, ts, element); rollback drop-tables being non-destructive.

`[A]` elsewhere: AWS RDS hosting + instance; pgvector availability; retention cron mechanism; all timeline estimates (AI-estimated); hairball mitigation specifics.

`[OPEN]` items: reviewers (Basics); O1-O7 above.

Reminder: this is a proposal until the signer verifies the Design claims and records `engineer_signoff`. Levi agreed to sign; an independent engineer verifier (O1) would strengthen it.
