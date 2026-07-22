# Executable tasks: multi-entity knowledge graph (Part 1)

Traces to `docs/trd-entity-graph.md`. Each task is one Claude Code session / one
PR. Same rules as Phase 7.

## Rules (read before any task)

1. A task is done only when its tests pass AND its verify command is green.
2. Write the listed tests BEFORE the implementation. Red, then green.
3. Any deviation from the TRD Design (section 5) is reported to Levi, not
   silently implemented.
4. Additive only: new tables (`tags`, `initiative_tags`) + one nullable column
   (`initiatives.pic_person_id`). Never drop `initiatives.tags[]` in this phase.
   Rollback = drop the two tables + the column.
5. Everything renders behind the existing `graph` feature flag.
6. Reuse patterns: `src/services/people.ts` (`upsertByName`) for tags/people
   upserts; `src/services/links.ts` (`buildGraph`) for the projection; the v1.2
   `src/db/run-reverse-retired.ts` shape for one-shot backfill scripts.

---

## Track A — Schema + backfill (M1) — start here

### E1 — tags + initiative_tags + pic_person_id schema
- Depends on: none.
- Read first: `src/db/schema.ts` (`people`, `initiatives`, index idiom), `src/db/migrations/`.
- Change: add `tags(id, name, created_at)` with a lower-unique index; `initiative_tags(initiative_id→cascade, tag_id→cascade, unique(initiative_id,tag_id))`; nullable `initiatives.pic_person_id` FK → `people.id`. Generate migration. Add the 3 tables/column to `truncateAll` (test reset).
- Tests first: migration applies cleanly; unique(initiative_id,tag_id) blocks a duplicate; `initiatives.tags[]` still present (not dropped).
- Verify: `npx drizzle-kit generate && npx vitest run tests/unit/entity-schema.test.ts`

### E2 — tag backfill script
- Depends on: E1.
- Read first: `src/services/links.ts` (generic-tag exclusion), `src/services/people.ts` (`upsertByName`).
- Change: `src/db/backfill-tags.ts` — for each distinct non-generic value in every `initiatives.tags[]`, upsert a `tags` row and insert the `initiative_tags` pair. Idempotent (re-run is a no-op). Runnable script.
- Tests first: on a seeded set, tag rows + join rows match the array contents; generic tags excluded; a second run adds nothing.
- Verify: `npx vitest run tests/integration/backfill-tags.test.ts`

### E3 — PIC → person backfill
- Depends on: E1.
- Read first: `src/services/people.ts` (`upsertByName`), `src/db/schema.ts` (`initiatives.pic`).
- Change: `src/db/backfill-pic.ts` — for each initiative, `upsertByName(pic)` and set `pic_person_id`. Idempotent. Report initiatives whose pic was blank/unresolvable.
- Tests first: every initiative gets a `pic_person_id`; a repeated PIC maps to one person; re-run changes nothing.
- Verify: `npx vitest run tests/integration/backfill-pic.test.ts`

---

## Track B — Projection + queries (M2)

### E4 — entity-graph projection service
- Depends on: E1 (schema); best after E2/E3 (data). 
- Read first: `src/services/links.ts` (`buildGraph`, in-memory pattern).
- Change: `src/services/graph.ts` — `buildEntityGraph(filter)` returning typed nodes (`initiative|person|tag|pillar|region|segment`) with namespaced refs (`"type:id"`) and typed edges (RAN, TAGGED, IN_PILLAR/REGION/SEGMENT, LINKED, REPLICATED_FROM). Reuse the Phase-7 in-memory build.
- Tests first (logic): on a fixture, node set has the right types/counts; each edge type appears with correct endpoints; region filter drops out-of-set nodes and their edges.
- Verify: `npx vitest run tests/integration/entity-graph.test.ts`

### E5 — traversal queries
- Depends on: E4.
- Read first: `src/services/graph.ts`.
- Change: `personInitiatives(id)`, `tagInitiatives(id)`, `neighbors(nodeRef, depth≤2)`.
- Tests first: person→their initiatives only; tag→initiatives sharing it; neighbors respects depth + node type.
- Verify: `npx vitest run tests/integration/entity-traversal.test.ts`

### E6 — API surface
- Depends on: E4, E5.
- Read first: `app/api/graph/route.ts`, `app/api/initiatives/[id]/links/route.ts`, `src/lib/guards.ts`.
- Change: extend `GET /api/graph` with a `types` filter; add `GET /api/people/[id]/graph` and `GET /api/tags/[id]/graph` (viewer, flag-gated).
- Tests first (contract): graph respects the `types` filter; hub endpoints return the expected node set; non-flag → 404.
- Verify: `npx vitest run tests/integration/entity-graph-api.test.ts`

---

## Track C — Hub pages + explorer (M3)

### E7 — explorer node types + type filter
- Depends on: E4, E6.
- Read first: `components/graph-canvas.tsx`, `app/(app)/graph/page.tsx`, `components/graph-filters.tsx`.
- Change: colour/shape nodes by type; add a node-type legend + filter; keep region/segment/pillar filters. Clicking a person/tag node routes to its hub.
- Tests first (interaction): multiple node types render; the type filter reduces them; a person node navigates to `/people/[id]`.
- Verify: `npx playwright test tests/e2e/entity-explorer.spec.ts`

### E8 — person hub page
- Depends on: E5, E6.
- Read first: `app/(app)/initiatives/page.tsx` (list pattern), `src/services/graph.ts`.
- Change: `app/(app)/people/[id]/page.tsx` — the person's initiatives (+ open action items, scores), and a focused ego graph. Flag-gated.
- Tests first: page lists the person's initiatives; a non-linked person shows an empty state.
- Verify: `npx playwright test tests/e2e/person-hub.spec.ts`

### E9 — tag hub page
- Depends on: E5, E6.
- Read first: `src/services/graph.ts`, `components/related-panel.tsx`.
- Change: `app/(app)/tags/[slug]/page.tsx` — initiatives with the tag + adjacent tags (tags co-occurring on the same initiatives). Flag-gated.
- Tests first: page lists tagged initiatives; adjacent tags computed correctly.
- Verify: `npx playwright test tests/e2e/tag-hub.spec.ts`

### E10 — detail related-panel: People + Themes
- Depends on: E5.
- Read first: `components/related-panel.tsx`.
- Change: add "People" (co-PIC initiatives) and "Themes" (shared-tag hubs) groups to the panel, each linking to the hub.
- Tests first: the panel shows people/tag groups when present; empty otherwise.
- Verify: `npx playwright test tests/e2e/related-panel-entities.spec.ts`

---

## Track D — Write path (M4)

### E11 — write tags through the join
- Depends on: E1, E2.
- Read first: `src/services/initiatives.ts` (create/append), `components/submit-form.tsx`, `src/services/edits.ts` (tag edits).
- Change: on create/edit, upsert tags and write `initiative_tags` (dual-write: keep `tags[]` mirrored for now). New PIC also sets `pic_person_id`.
- Tests first: creating with tags populates the join AND the array; editing tags updates both; parity holds.
- Verify: `npx vitest run tests/integration/tag-write-path.test.ts`

### E12 — deprecate tags[] (gated on E3/open question E3)
- Depends on: E11 + all UI reading the join.
- Change: switch the list-page tag filter to the join; stop writing `tags[]`; a later migration drops the column. DO NOT start until Levi confirms (open question E3).

---

## Stretch (only if M2 lands early)

### E13 — action_items as nodes
- Depends on: E4.
- Change: add ASSIGNED (action_item→person) + BELONGS_TO (action_item→initiative) edges; surface open action items on the person hub. Scope decision is TRD open question E2.

---

## Dependency order

```
E1 ─┬─ E2 ─┐
    └─ E3 ─┴─ E4 ─┬─ E5 ─┬─ E6 ─┬─ E7           (explorer)
                  │      │      ├─ E8 (person hub)
                  │      │      ├─ E9 (tag hub)
                  │      │      └─ E10 (panel)
                  └──────┴─ E11 ── E12 (gated)   (write path)
E13 (stretch, after E4)
```

## The 3 tasks to start with
1. **E1** — schema, unblocks everything, pure additive.
2. **E2** — tag backfill, gives the graph its tag nodes from data you already have.
3. **E4** — the projection service; the highest-logic, fully test-verifiable piece that all UI depends on.
