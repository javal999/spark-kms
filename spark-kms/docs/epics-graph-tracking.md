# Epics & stories: knowledge graph + usage tracking (Phase 1)

| | |
|---|---|
| Traces to | `docs/trd-graph-tracking.md` (Phase 1) |
| Status | Provisional. The TRD is a proposal until its Design [A] tags resolve; refine estimates after engineer review. |
| Cadence | [OPEN — 2-week sprints or kanban, owner Levi] |
| Sizing | All sizes are AI-estimated; the team corrects them in refinement. |

Sequencing rule from the TRD: tracking instrumentation lands before the graph UI, so the graph's own adoption is measurable from day 1.

## Epic overview

| Epic | Phase | Traces to | Depends on | Order |
|---|---|---|---|---|
| E1 Tracking pipeline | 1 | TRD §5, §7 | — | 1 |
| E2 Graph data foundation | 1 | TRD §5 (initiative_links) | — (can parallel E1) | 2 |
| E3 Graph UI | 1 | TRD §5 interfaces, PRD §6 | E2, and E1 emitter live | 3 |
| E4 Tracking dashboard | 1 | PRD §4, TRD §5 | E1 (needs event data) | 4 |
| E5 Click heatmaps | 2 | TRD §3 non-goals (reserved) | E1 | later |
| E6 AI-derived relations | 2 | TRD §3, research §4 | E2, deploy/pgvector (O2) | later |

Parallelism: E1 and E2 have no shared code and can run at once. E3 needs both. E4 needs E1's data. E5/E6 are Phase 2.

---

## E1 Tracking pipeline

Goal: capture page views and marked clicks into an append-only store, with no PII. Done when events flow from the browser to `usage_events` behind a feature flag, malformed batches are dropped, and the 90-day retention job runs.

- **E1-S1** As the system, I record a page view on route change. Acceptance: navigating between app routes emits 1 `page_view` with `route_pattern` (dynamic ids normalized); no event fires on initial hydration twice; emission is gated by the tracking feature flag. Tech notes: client hook using `usePathname`; batch + `sendBeacon` on interval, `visibilitychange`, `pagehide` (TRD §5). Deps: none. Size: M.
- **E1-S2** As the system, I record a click only on `data-track` elements. Acceptance: clicking an element with `data-track` emits 1 `click` with `element_id`, `element_text`, normalized `click_x/y_norm`; clicking an untracked element emits nothing; coordinates are 0-1. Tech notes: delegated document listener (TRD §5 edge cases). Deps: E1-S1. Size: M.
- **E1-S3** As the system, I ingest event batches safely. Acceptance: `POST /api/events` accepts a batch, Zod-validates, stores valid rows, drops malformed without a 500; no PII column exists or is populated; per-session rate limit applied. Tech notes: mirror `score_events` append-only pattern; reuse `src/lib/rate-limit.ts`. Deps: E1-S1. Size: M.
- **E1-S4** As the owner, raw events expire on schedule. Acceptance: rows older than 90 days are deleted by a job; `usage_daily` rollup is written nightly and survives the deletion. Tech notes: cron mechanism O4. Deps: E1-S3. Size: S.

## E2 Graph data foundation

Goal: store and query initiative edges from three sources. Done when explicit, co-tag, and replicated-from edges exist and backlinks/2-hop/orphan queries return correct results.

- **E2-S1** As an admin, I link two initiatives. Acceptance: create an `explicit` edge via API; it appears for both initiatives; duplicate edge of same type rejected; self-link rejected; delete removes it. Tech notes: `initiative_links` table, unique(src,dst,type) (TRD §5). Deps: none. Size: M.
- **E2-S2** As the system, co-tag edges derive automatically. Acceptance: two initiatives sharing ≥1 tag are connected as `co_tag`; removing the shared tag removes the edge; generic/empty tags excluded. Tech notes: computed from `initiatives.tags`, not double-stored (TRD §5 [A]). Deps: E2-S1. Size: M.
- **E2-S3** As the system, replicated-from becomes an edge. Acceptance: an initiative with `replicated_from` set shows a `replicated_from` edge to its source; inert column is now read. Tech notes: activate `src/db/schema.ts:141`. Deps: E2-S1. Size: S.
- **E2-S4** As a developer, traversal queries exist. Acceptance: backlinks (dst=?), forward links (src=?), 2-hop neighbors (recursive CTE, depth cap 2), orphans (no links) each return correct sets on a seeded fixture. Tech notes: TRD §4, §5. Deps: E2-S1. Size: M. Flag: pure logic, fully test-verifiable.

## E3 Graph UI

Goal: make relationships visible to viewers. Done when the detail page shows related initiatives and the `/graph` explorer renders, filters, and highlights orphans.

- **E3-S1** As a viewer, I see related initiatives on an initiative. Acceptance: the detail page shows a backlinks + forward-links list; each opens that initiative; an initiative with no edges shows an empty state, not an error. Tech notes: extend `app/(app)/initiatives/[id]/page.tsx`. Deps: E2-S4. Size: M.
- **E3-S2** As a viewer, I see a small ego graph on the detail page. Acceptance: 1-2 hop graph renders around the current node; clicking a node navigates to it. Tech notes: react-force-graph 2D (TRD §6). Deps: E3-S1. Size: M.
- **E3-S3** As a viewer, I open a global graph explorer. Acceptance: `/graph` renders nodes=initiatives; filter by region/segment/pillar; orphans visibly flagged; node click opens detail; viewer-facing per decision. Tech notes: new route; reuse filter patterns from `initiatives-filters.tsx`. Deps: E2-S4, E3-S2. Size: L.

## E4 Tracking dashboard

Goal: answer the four usage questions for the owner. Done when all four render over real event data with a shared date range.

- **E4-S1** As the owner, I see top pages and top clicks. Acceptance: two ranked lists (by `route_pattern`; by `element_id`+label); dynamic routes grouped; date range applies. Tech notes: `GET /api/dashboard/usage`; recharts (already installed). Deps: E1-S3. Size: M.
- **E4-S2** As the owner, I see usage trends over time. Acceptance: day and week time series for views and clicks from `usage_daily`. Tech notes: recharts line/area. Deps: E1-S4. Size: S.
- **E4-S3** As the owner, I see my own page frequency, and no one else's. Acceptance: filter the page metric to my pseudonymized id; no query path exposes another named person's activity. Tech notes: enforce in query, not just UI (TRD §4 privacy). Deps: E1-S3. Size: S. Flag: privacy rule must be test-verified (a query for another actor returns aggregate-only).

## E5 Click heatmaps (Phase 2, reserved)

Goal: visualize click density per page. Capture already lands in E1 (`click_x/y_norm`); this epic is render only. Done when an admin overlay renders click density with heatmap.js. Open: Q7 asks whether to build at all. Stories deferred until Phase 2 is greenlit.

## E6 AI-derived relations (Phase 2, reserved)

Goal: suggest related initiatives via embeddings, admin-confirmed. Reuses the `duplicates.ts` human-confirm pattern; needs pgvector (O2). Done when top-k suggestions surface as `derived_similar` edges after confirmation. Stories deferred until Phase 2 and deploy target are confirmed.

---

## Stories with no test-verifiable acceptance criterion

None. Every Phase 1 story above has at least one criterion checkable by a unit, contract, or interaction test. E2-S4 (traversal) and E4-S3 (privacy rule) are called out as must-test.
