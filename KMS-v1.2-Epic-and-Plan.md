# SPARK KMS v1.2 — Epic & executable plan

| | |
|---|---|
| doc_type | epic / executable plan |
| Owner | Levi |
| Source of truth | KMS-Requirements-Doc v1.2 (decisions D9–D19) · TRD Phase 6 |
| Consumer | Claude Code, executing workstream by workstream |
| Status | Draft — ready to execute |
| Date | 2026-07-10 |
| Provenance | `[V]` = current shipped behavior · `[A]` = to build |

## 1. Epic

Reshape SPARK KMS scoring from 4 streams to **2 (Best Practice, Best Presenter)**, move **CEE to a Pillar**, make the two weekly awards **auto-award +2 (no confirmation, capped 1/Area/week)**, add a **PIC people directory**, harden **bulk upload** (persist PIC + dedup review), and apply an **18-item UI batch** — all on a **live production system** without corrupting the score ledger or losing data.

**In scope:** the 18 feedback items (traceability §7). **Out of scope:** V2 roadmap (semantic dedup, NL search, digests, attachments, per-viewer accounts).

## 2. Ground rules (do not violate)

1. **`scoring.ts` is the only writer of `score_events`.** Removals go through `reverse()`, never raw DELETE/UPDATE (REQ-S2).
2. **Test-first for every scoring rule.** Write the failing test from requirements §5, then implement.
3. **The golden test is re-baselined, never silently broken.** Update `tests/fixtures/spark-45.ts` + the golden test to the 2-stream model in the same commit as the scoring change (D16).
4. **No retroactive awards** (D13). Existing nominated-unconfirmed entries are NOT auto-awarded.
5. **Migration is gated:** full DB snapshot → dry-run on a copy → apply. It reverses historical CEE/presenter events; past leaderboard numbers will shift — that is accepted (D16).
6. **Confirm before every push and deploy** (personal→GitHub, office→GitLab; this is an office project → GitLab primary, GitHub backup). Deploy per `spark-kms/LIGHTSAIL-DEPLOY.md`.
7. Each workstream has a test gate; do not start the next before it passes. Keep the whole app green (`vitest`, `tsc`, `eslint`, `next build`) at every gate.

## 3. Execution order

Build and test everything (A → F) on branches, **then** deploy + migrate (G). The live-data reversal (C) runs only during the gated deploy, after the new code is verified locally.

```
A schema + migration prep  →  B scoring engine (2-stream)  →  D PIC directory
                                        │                        E bulk dedup review
                                        │                        F UI batch
                                        └──────────────► G deploy + migrate (gated)
```

---

## Workstream A — schema + migration prep `[A]`

- **A1.** `src/db/schema.ts`: add `person` table (`id, name, active default true, createdBy, createdAt`; unique index on `lower(name)`). Add `entries.bestPresenter` boolean default false.
- **A2.** `pillarEnum`: add value `CEE` (additive `ALTER TYPE`).
- **A3.** Decide the `score_stream` strategy (`[OPEN]` → resolve first thing): recommended — **keep the `presenter` enum value, relabel it "Best Presenter" in the app; stop writing/summing `cee`/`cee_best`.** Avoids an in-use enum rewrite. Document the choice in the migration file.
- **A4.** `drizzle-kit generate` the additive migration. Do NOT apply to prod (Workstream G).
- **Gate A:** `tsc` clean; migration applies cleanly to the **test** DB; `truncateAll` includes `person`.

## Workstream B — scoring engine, 2 streams `[A]` (test-first)

- **B1.** Rewrite the `RULES`/award paths in `src/services/scoring.ts`: keep `new_initiative` (+1 best_practice), `entry` (+1, day-cap). Change `bp_of_week` → **auto-award +2 best_practice, cap 1/Area/week** (reuse the existing area-week-cap logic that presenter used). Add `best_presenter` → **+2 best_presenter, cap 1/Area/week**. Delete `presentation`, `cee_participation`, `cee_best` award paths.
- **B2.** Wire the two flags into the create/append path (`src/services/initiatives.ts`): when `bpOfWeek`/`bestPresenter` is true on an entry, call `award()` immediately (was: nomination only). Remove the super-admin confirm path (`confirmBpOfWeek`) and the manual-stream/CEE admin service functions.
- **B3.** `src/services/scores.ts`: leaderboard + `initiativeStreamTotals` → 2 streams (best_practice, best_presenter); `total` = their sum.
- **B4.** Re-baseline `tests/fixtures/spark-45.ts` + `tests/integration/golden.test.ts` to the 2-stream model (BP-of-week now auto, capped 1/Area/week; no CEE).
- **Gate B:** unit tests cover: +1/+1 caps, **auto bp_of_week +2 capped 1/Area/week** (2nd in same Area/week skipped), **best_presenter +2 capped**, no-backfill, reversal idempotency; **golden test green** at the new baseline; property test (leaderboard = direct SUM). `tsc`/lint/build clean.

## Workstream C — live-data migration script `[A]` (runs in G, built here)

- **C1.** `src/db/migrate-v12.ts` (idempotent): for every non-reversed `score_events` row with stream `cee`/`cee_best` OR reason `presentation`, write a compensating `reversal` event via `scoring.ts` (net zero). Guard against double-running (skip if a reversal already exists for the ref).
- **C2.** Dry-run mode: run against a **restored copy** of the prod DB; assert every retired-stream area total becomes 0 and best_practice/entry totals are untouched.
- **Gate C:** on a prod-copy, script is idempotent (second run is a no-op), reverses only retired streams, leaves best_practice/best_presenter/new/entry intact.

## Workstream D — PIC directory `[A]`

- **D1.** `src/services/people.ts`: list/search, `upsertByName` (case-insensitive), deactivate; `appendFromName(name)` used by Submit + upload.
- **D2.** Routes: `GET /api/people` (viewer, autocomplete), `GET/POST /api/admin/people` (super: list, upload xlsx), `PATCH /api/admin/people/[id]` (deactivate), `GET /api/admin/people/template` (names-only xlsx).
- **D3.** Submit form + detail edit: PIC becomes a **searchable combobox** over `/api/people`; typing a new name appends via `upsertByName`.
- **D4.** Bulk upload (`src/services/upload.ts`): persist row PIC on the initiative **and** `appendFromName`; pass the row PIC into `maybeCreateActionItems` so action items stop defaulting to "Unassigned" (D15, fixes item 7).
- **Gate D:** integration — upload with new PICs creates `person` rows; action items carry the row PIC; picker autocomplete returns matches; a typed new name persists.

## Workstream E — bulk dedup review + acknowledgment `[A]`

- **E1.** Preview UI (`components/bulk-upload.tsx`): add batch actions — "all flagged → new", "all flagged → append to top match", "reject all" (sets batch `rejected`), plus the existing per-row resolve.
- **E2.** A required **acknowledgment checkbox** ("I reviewed the N similar initiatives") gates the Commit button; commit rejects without it (REQ-U9, item 8).
- **Gate E:** integration — commit blocked without acknowledgment; batch actions apply to all flagged rows; "reject all" marks the batch rejected and writes nothing.

## Workstream F — UI batch `[A]` (each item browser-verified)

- **F1 (item 1, D17):** move the top nav to a **collapsible left sidebar** (`components/nav.tsx` → sidebar; icon-rail + mobile drawer; persist state). Re-anchor the admin section directory's sticky offset.
- **F2 (item 9):** dashboard — remove "Has a Best Practice" / "Has an Unlocking" cards.
- **F3 (items 10–11):** dashboard — "Weekly Top Initiatives", default current week; add PIC + Stage per row (extend `topInitiatives()` SQL).
- **F4 (items 12–13):** list — `%-done` column (done ÷ total; 0-items → "—") + bucket filter (0 / in-progress / 100, "—" excluded, D19); collapse filters into a popover with active chips (keep URL state).
- **F5 (items 14–17):** detail — drop CEE/CEE-Best tiles (Total = 2 streams); drop the "Best Practice" category badge (keep "Unlocking"); move the doc link above the description as "View doc ↗"; remove the follow-up display block (keep the field feeding action items).
- **F6 (item 18, D18):** leaderboard — 2 stream columns; show Pillar + PIC per initiative on the **area drill-down** page.
- **F7 (items 5–6):** Submit — rename checkbox to "Best Practice of the Week"; add "Best Presenter of the Week"; both auto-award (wired in B2).
- **Gate F:** `tsc`/lint/build clean; browser-verify each screen (no horizontal scroll, nav collapse, filter popover, auto-award toast). 172+ tests still green.

## Workstream G — deploy + migrate (gated, live) `[A]`

1. Merge A–F to `main` (via PR). Confirm with Levi before push.
2. **Snapshot the prod DB** (Lightsail relational-database snapshot) — D16.
3. Build amd64 image; push to Lightsail.
4. Open prod DB → apply the **additive** schema migration (person, best_presenter, pillar CEE) → run **C1** (reverse retired-stream events) → verify (retired totals = 0, best_practice intact) → re-lock DB.
5. Cut the new deployment; wait RUNNING.
6. Live smoke: health 200; leaderboard shows 2 streams; submit an entry with each box ticked → +2 lands, 2nd in same Area/week skipped; PIC picker adds a person; upload persists PIC; dashboard/list/detail render.
7. If anything is off: roll back to the prior image; the snapshot restores data.

## 4. Definition of done

All six gates green · golden test re-baselined and passing · prod migrated (retired streams reversed, no raw deletes) · live smoke passed · requirements v1.2 + TRD match the shipped behavior · both git remotes updated.

## 5. Risk register

| Risk | Mitigation |
|---|---|
| Migration corrupts the ledger | Only via `reverse()`; idempotent; dry-run on a prod copy; snapshot before apply (C, G2) |
| Golden test silently broken | Re-baseline in the same commit as B; gate B fails otherwise |
| Auto-award gaming (self-serve +2, bulk column) | 1/Area/week caps on both awards (B1); dedup acknowledgment (E2); accepted trade-off (D14) |
| `score_stream` enum can't drop values | Keep `presenter` value relabeled; stop summing cee/cee_best (A3) |
| Past leaderboard numbers change | Expected + accepted (D16); communicate to stakeholders |
| Colima/Docker flakiness at deploy | Known; restart Colima, rebuild, redeploy (seen in prior deploys) |

## 6. Traceability — 18 items → decision → workstream

| # | Feedback item | Decision | Task |
|---|---|---|---|
| 1 | Collapsible side nav | D17 | F1 |
| 2 | PIC directory upload + picker | D9 | A1, D1–D3 |
| 3 | Presenter auto point | D12 | B1 (removed; superseded by Best Presenter) |
| 4 | Remove CEE from points; CEE→pillar | D10, D11 | A2, B1, C |
| 5 | Auto +2 Best Presenter | D12, D14 | A1, B1–B2, F7 |
| 6 | Rename checkbox → Best Practice of the Week | D14 | F7 |
| 7 | Bulk upload saves PIC | D15 | D4 |
| 8 | Bulk dedup review + acknowledgment | REQ-U9 | E1–E2 |
| 9 | Dashboard: remove BP/Unlocking cards | — | F2 |
| 10 | Weekly Top Initiatives | — | F3 |
| 11 | Top initiatives: PIC + stage | — | F3 |
| 12 | List %-done + filter | D19 | F4 |
| 13 | Simplify list filters | — | F4 |
| 14 | Detail: remove CEE tiles | D11 | B3, F5 |
| 15 | Detail: remove BP category badge | — | F5 |
| 16 | Detail: doc link on top | — | F5 |
| 17 | Detail: remove follow-up section | — | F5 |
| 18 | Leaderboard: pillar + contributor | D18 | B3, F6 |
