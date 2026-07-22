# Executable tasks: knowledge graph + usage tracking (Phase 1)

Traces to `docs/epics-graph-tracking.md` and `docs/trd-graph-tracking.md`. Each task is sized for one Claude Code session / one PR.

## Rules (read before any task)

1. A task is done only when its listed tests pass AND its verification command is green. Not before.
2. Write the listed tests BEFORE the implementation. Red, then green.
3. Any deviation from the TRD Design section (section 5) is reported back to Levi, not silently implemented. If the code forces a different shape, stop and say so.
4. Do not touch existing tables in a migration. Both features are additive: new tables only (`initiative_links`, `usage_events`, `usage_daily`). Rollback = drop the new tables.
5. Ship both features behind a feature flag. Nothing emits or renders until the flag is on.
6. Reuse existing patterns: `src/services/scoring.ts` for append-only ledger writes, `src/services/duplicates.ts` for pg_trgm, `src/lib/guards.ts` for auth, `src/lib/rate-limit.ts` for limits, recharts for charts.
7. The TRD is a proposal until its Design [A] tags resolve. Confirm with Levi before running these against production data.

Stack for commands: pnpm/npm, `drizzle-kit` for migrations, `vitest` for unit/integration, `@playwright/test` for E2E.

---

## Track A — Tracking pipeline (E1) — start here

### T1 — usage_events + usage_daily schema
- Story: E1-S3, E1-S4. Depends on: none.
- Read first: `src/db/schema.ts`, `src/db/migrations/` (naming convention), `src/db/schema.ts` `score_events` block (copy the append-only shape).
- Change: add `usage_events` (event_type enum, route_pattern, path, element_id, element_text, session_id, actor_hash, ts, viewport_w/h, click_x_norm, click_y_norm, referrer_path) and `usage_daily` (day, route_pattern, event_type, count). Indexes on route_pattern, ts, element_id. No PII columns. Generate migration.
- Tests first: a schema test asserting no column named ip/email/user_agent exists on `usage_events`; migration applies cleanly on a test DB.
- Acceptance: tables created; `npx drizzle-kit generate` produces one additive migration; existing tables unchanged in the diff.
- Verify: `npx drizzle-kit generate && npx vitest run tests/unit/usage-schema.test.ts`

### T2 — /api/events ingest endpoint
- Story: E1-S3. Depends on: T1.
- Read first: `app/api/health/route.ts` (route handler shape), `src/validation/entry.ts` (Zod pattern), `src/lib/rate-limit.ts`, `src/services/scoring.ts` (append-only write).
- Change: `POST /api/events` accepts a JSON batch, Zod-validates each event, inserts valid rows, drops malformed without throwing, applies per-session rate limit. New `src/services/usage.ts` owns the write (the only writer of `usage_events`).
- Tests first (contract): valid batch stored; batch with 1 malformed event stores the rest and returns 200; oversized/garbage body returns 400 not 500; no PII persisted.
- Acceptance: contract tests green; rate limit rejects a flood.
- Verify: `npx vitest run tests/integration/events-ingest.test.ts`

### T3 — client emitter hook (page views + data-track clicks)
- Story: E1-S1, E1-S2. Depends on: T2.
- Read first: `app/(app)/layout.tsx` (where to mount), a `"use client"` component e.g. `components/nav.tsx`, `proxy.ts` (route groups).
- Change: `components/usage-tracker.tsx` (client): page_view on `usePathname` change; one delegated document click listener firing only for `[data-track]`; batch in memory; flush via `sendBeacon` on interval + `visibilitychange` + `pagehide`. Mount in the app-group layout behind the flag. Add `data-track` to 3 high-value elements to prove the path (submit button, a nav link, a graph entry point once it exists).
- Tests first (interaction): Playwright — navigating routes emits exactly 1 page_view each; clicking a `data-track` element emits 1 click; clicking an untracked element emits 0; coordinates within 0-1.
- Acceptance: interaction tests green; no double page_view on hydration.
- Verify: `npx playwright test tests/e2e/usage-emitter.spec.ts`

### T4 — retention job + nightly rollup
- Story: E1-S4. Depends on: T1, T2.
- Read first: `src/services/week.ts` (Asia/Jakarta date math), any existing scheduled/one-off script location.
- Change: a job that (a) upserts `usage_daily` from raw events, (b) deletes `usage_events` rows older than 90 days. Cron mechanism is O4; ship as a runnable script + document the trigger.
- Tests first: rollup produces correct daily counts on a seeded set; delete removes only rows >90 days; aggregate survives the delete.
- Acceptance: logic tests green; script runs idempotently twice.
- Verify: `npx vitest run tests/unit/usage-retention.test.ts`

---

## Track B — Graph data foundation (E2) — parallel with Track A

### T5 — initiative_links schema
- Story: E2-S1. Depends on: none. Parallel with T1.
- Read first: `src/db/schema.ts` (`initiatives`, self-FK `replicated_from` at line ~141), `src/db/migrations/`.
- Change: add `initiative_links` (src_id, dst_id, type enum explicit|co_tag|replicated_from|derived_similar, weight numeric null, created_by, created_at, unique(src_id,dst_id,type)). `derived_similar` + `weight` present but unused (Phase 2 reservation). Generate migration.
- Tests first: unique constraint blocks a duplicate edge; self-link (src=dst) rejected by a check or service guard.
- Acceptance: additive migration; existing tables untouched.
- Verify: `npx drizzle-kit generate && npx vitest run tests/unit/links-schema.test.ts`

### T6 — link service: create/delete explicit edges + traversal
- Story: E2-S1, E2-S4. Depends on: T5.
- Read first: `src/services/initiatives.ts` (`listInitiatives`, `getInitiativeDetail`), `src/services/scores.ts` (read-aggregation style).
- Change: `src/services/links.ts` with createExplicit, delete, and queries: backlinks(dst=?), forwardLinks(src=?), neighbors2hop (recursive CTE, depth cap 2), orphans (no rows in initiative_links). Guard self-links and duplicates.
- Tests first (logic): on a seeded fixture, each query returns the expected id set; self-link rejected; duplicate rejected.
- Acceptance: all traversal logic tests green (this story is fully test-verifiable, E2-S4 flag).
- Verify: `npx vitest run tests/unit/links-traversal.test.ts`

### T7 — co-tag edge derivation
- Story: E2-S2. Depends on: T6.
- Read first: `src/db/schema.ts` (`initiatives.tags`), `src/services/initiatives.ts` (where tags are written).
- Change: derive `co_tag` edges from shared `tags[]` at read time (do not double-store); exclude empty/generic tags; a shared-tag change reflects on next read. Expose via the link service.
- Tests first: two initiatives sharing a tag appear connected; removing the shared tag disconnects them; generic tag excluded.
- Acceptance: derivation tests green; no co_tag rows persisted that contradict current tags.
- Verify: `npx vitest run tests/unit/links-cotag.test.ts`

### T8 — activate replicated_from as an edge
- Story: E2-S3. Depends on: T6.
- Read first: `src/db/schema.ts:141` (the inert self-FK).
- Change: expose `replicated_from` as a `replicated_from` edge in the link service reads; optionally backfill from any existing values.
- Tests first: an initiative with `replicated_from` set returns a replicated_from edge to its source.
- Acceptance: test green; the previously-inert column is now read.
- Verify: `npx vitest run tests/unit/links-replicated.test.ts`

### T9 — link API endpoints
- Story: E2-S1. Depends on: T6.
- Read first: `app/api/initiatives/[id]/route.ts`, `src/lib/guards.ts` (requireAdmin), `src/services/apiOps.ts` (if exposing to /api/v1 later).
- Change: `GET/POST/DELETE /api/initiatives/[id]/links` (writes require admin), and `GET /api/graph` returning nodes+edges filtered by region/segment/pillar.
- Tests first (contract): non-admin POST returns 403; create then GET returns the edge; delete removes it; /api/graph respects filters.
- Acceptance: contract tests green.
- Verify: `npx vitest run tests/integration/links-api.test.ts`

---

## Track C — Graph UI (E3) — after Track B, and Track A emitter live

### T10 — related-initiatives panel on detail page
- Story: E3-S1. Depends on: T6, T9. And T3 (so the panel's opens are tracked).
- Read first: `app/(app)/initiatives/[id]/page.tsx` (server component, where sections render), `components/detail-edit.tsx`.
- Change: add a "Related initiatives" panel: backlinks + forward-links list, each linking to that initiative; empty state when no edges. Add `data-track` to the panel's entry.
- Tests first (interaction): panel lists linked initiatives; item click navigates; no-edge initiative shows empty state, not error.
- Acceptance: interaction test green.
- Verify: `npx playwright test tests/e2e/related-panel.spec.ts`

### T11 — ego graph on detail page
- Story: E3-S2. Depends on: T10. Adds dependency: react-force-graph.
- Read first: `package.json` (add dep), `app/(app)/initiatives/[id]/page.tsx`.
- Change: render a 1-2 hop ego graph (react-force-graph 2D, client component); node click navigates. Keep it below the list (list carries more value).
- Tests first: a node renders for the current initiative and its neighbors; clicking a neighbor navigates.
- Acceptance: interaction test green; bundle impact noted in the PR.
- Verify: `npx playwright test tests/e2e/ego-graph.spec.ts`

### T12 — global graph explorer /graph
- Story: E3-S3. Depends on: T9, T11.
- Read first: `components/initiatives-filters.tsx` (reuse filter UI), `app/(app)/initiatives/page.tsx` (list-page pattern), `proxy.ts` (route is viewer-facing).
- Change: new `app/(app)/graph/page.tsx`: nodes=initiatives from `/api/graph`, filters region/segment/pillar, orphan highlight, node click opens detail. Viewer-facing.
- Tests first: explorer renders nodes; a filter reduces the set; orphan flagged; node click navigates.
- Acceptance: interaction test green; performs acceptably at the seeded node count.
- Verify: `npx playwright test tests/e2e/graph-explorer.spec.ts`

---

## Track D — Tracking dashboard (E4) — after Track A has data

### T13 — usage dashboard API
- Story: E4-S1, E4-S3. Depends on: T2 (data), T4 (rollup).
- Read first: `src/services/scores.ts` (aggregation style), `app/api/dashboard/route.ts`.
- Change: `GET /api/dashboard/usage` returning top pages (by route_pattern), top clicks (by element_id+label), and own-frequency (filtered to caller's actor_hash). Enforce in the query that no other named actor's per-person data is returnable.
- Tests first (contract + privacy): top-page and top-click aggregates correct on a fixture; a request for another actor's per-person breakdown returns aggregate-only (E4-S3 must-test).
- Acceptance: contract + privacy tests green.
- Verify: `npx vitest run tests/integration/usage-dashboard-api.test.ts`

### T14 — usage dashboard UI
- Story: E4-S1, E4-S2. Depends on: T13.
- Read first: any existing recharts usage in the repo, `app/(app)/admin/page.tsx` (gating pattern).
- Change: owner-facing dashboard (admin/super gated): ranked top-pages and top-clicks, a time-series trend (day/week) from usage_daily, shared date-range control. recharts.
- Tests first: renders the four sections; date range changes the data shown.
- Acceptance: interaction test green.
- Verify: `npx playwright test tests/e2e/usage-dashboard.spec.ts`

---

## Phase 2 (reserved, do not start without greenlight)

- Heatmaps (E5): capture is already in T1/T3; render with heatmap.js behind an admin overlay. Gated on Q7 (is it worth building).
- AI relations (E6): pgvector + embeddings + admin-confirm reusing `src/services/duplicates.ts`. Gated on O2 (deploy/pgvector).

---

## Dependency order & parallelism

```
T1 ─┬─ T2 ── T3 ──────────────┐
    └─ T4 ──────────┐         │
T5 ── T6 ─┬─ T7      │         ├─ T10 ── T11 ── T12   (graph UI)
          ├─ T8      │         │
          └─ T9 ─────┴─────────┘
T13 (needs T2,T4) ── T14                              (dashboard)
```

Parallel-safe: Track A (T1-T4) and Track B (T5-T9) share no code — run them at the same time. Within B, T7/T8/T9 parallelize after T6.

## The 3 tasks to start with

1. **T1 (usage_events schema)** — unblocks the entire tracking track and must land early so baseline data accrues before the graph ships (TRD sequencing rule). Pure additive migration, low risk.
2. **T5 (initiative_links schema)** — unblocks the entire graph track, parallel to T1, zero shared code. Two schema tasks first means both tracks can then move independently.
3. **T6 (link traversal service)** — the highest-logic, fully test-verifiable piece; getting backlinks/2-hop/orphan correct on a fixture de-risks all graph UI that follows, and it needs no UI to validate.
