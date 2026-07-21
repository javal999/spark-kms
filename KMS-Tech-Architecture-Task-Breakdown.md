# SPARK KMS: technical architecture and task breakdown

| | |
|---|---|
| doc_type | trd |
| Source of truth | KMS-Requirements-Doc (v1.2, 2026-07-10). Decisions D1–D19 resolved. |
| Status | Phases 1–5 **Approved / shipped** (live in prod). Phase 6 (v1.2) = **Draft**, engineer signoff pending. |
| Consumer | Claude Code, executing phase by phase |
| owner / last_verified | Levi / 2026-07-10 |
| Rule | If this doc and the requirements doc disagree, the requirements doc wins. Stop and ask Levi. |

**Glossary / systems** — SPARK KMS: this app. Lightsail: AWS's fixed-price container + managed-Postgres tier (prod host). Drizzle: the TypeScript ORM. pg_trgm: Postgres trigram extension for fuzzy title matching. Area: a Region×Segment pair (the leaderboard grain). PIC: "person in charge" (field staff named on an initiative). MCP: Model Context Protocol (the AI-tool integration surface).

**Provenance** — `[V]` verified by the shipped, deployed code · `[A]` assumed / design-only, verify during the Phase-6 build · `[OPEN — …]` unresolved. Phase 1–5 facts are `[V]`; v1.2 additions below are `[A]` until built.

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript `[V]` | 1 codebase for UI + API. Note: route gate is `proxy.ts` (Next 16 renamed `middleware`); async params/cookies |
| Database | PostgreSQL (Neon or Supabase free tier) | pg_trgm for fuzzy matching; SQLite lacks it. Local dev: Docker Postgres or Neon branch |
| ORM | Drizzle | Typed schema, plain SQL migrations, no codegen step |
| UI | Tailwind CSS + shadcn/ui | Fast, consistent tables/forms/badges |
| Charts | Recharts | Dashboard distribution charts |
| Auth | iron-session (cookie sessions) | 2 credential types (shared viewer password, admin email+password); NextAuth is overkill |
| Passwords | argon2 | Requirement (section 9) |
| Excel | exceljs | Both template generation (styled, dropdown validation) and upload parsing |
| Validation | Zod | 1 schema shared by form API and Excel row parser (REQ-U6) |
| Tests | Vitest (unit/integration) + Playwright (E2E) | Phase test gates |
| Deploy | **AWS Lightsail** container service + managed Postgres, ap-southeast-1 `[V]` | Custom domain kms.paracorplabs.com; ~$30/mo. amd64 image built via Colima+Rosetta. Runbook: `spark-kms/LIGHTSAIL-DEPLOY.md` |
| OpenAPI | **Zod v4 native `z.toJSONSchema`** + Scalar docs `[V]` | Spec generated from the shared Zod schemas (REQ-X1). Chosen over `zod-openapi` to avoid a Zod-v4 compat risk |
| MCP | `mcp-handler` + @modelcontextprotocol/sdk, streamable HTTP at /api/mcp `[V]` | Thin surface over the shared `apiOps` layer; same keys/scopes (REQ-X6..X8) |

## 2. Project structure

```
spark-kms/
  app/
    (viewer)/            # dashboard, list, detail, leaderboard (viewer-gated)
    submit/              # admin form + bulk upload (admin-gated)
    admin/               # settings, scoring console (super-admin-gated)
    login/
    api/                 # route handlers, thin: parse -> service -> respond
  src/
    db/schema.ts         # Drizzle schema (single file, mirrors section 3)
    db/migrations/
    services/
      scoring.ts         # THE ONLY module that writes score_events
      duplicates.ts      # pg_trgm candidate query
      upload.ts          # 2-phase pipeline (preview/commit)
      template.ts        # xlsx template generator
      week.ts            # Asia/Jakarta week math (pure functions)
    validation/entry.ts  # Zod schemas (shared form + Excel)
  tests/
    unit/  integration/  e2e/
    fixtures/spark-45.ts # golden fixture from the real file (off-enum rows corrected)
```

Conventions: server components by default; no client state library (URL params carry filter state, REQ from list page); all date logic server-side via `week.ts`; every service function takes `actorId` for created_by.

## 3. Database schema (DDL summary)

Enums as Postgres enums — **v1.2 values `[A]`:** `region` (5), `segment` (4), `pillar` (**6**, +CEE), `entry_category` (2), `stage` (4), `action_status` (4), `score_stream` (**2**: best_practice, best_presenter), `score_reason` (**6**: new_initiative, entry, bp_of_week, best_presenter, adjustment, reversal), `batch_status` (3), plus already-shipped `api_scope` (2) and `edit_entity` (3) `[V]`. Values exactly per requirements §4.1.

```sql
users            id, email unique, name, password_hash, is_super boolean, active, created_at
app_config       key text pk, value jsonb   -- viewer_password_hash, dedup_threshold, template_version
initiatives      id serial pk, title, description, region, segment, pillar, stage default 'Idea',
                 pic, link_url, tags text[], replicated_from int null refs initiatives,
                 created_at, created_by refs users, updated_at
entries          id, initiative_id refs, entry_date date, category, detail, follow_up,
                 bp_of_week_nominated bool default false, bp_of_week_confirmed_at timestamptz null,
                 link_url, outcome_metric, outcome_value, upload_batch_id null, created_at, created_by
action_items     id, initiative_id refs, due_date, description, pic, status default 'Not Started',
                 source_entry_id null refs entries, created_at, created_by, updated_at
stage_changes    id, initiative_id refs, from_stage, to_stage, changed_at, changed_by
score_events     id, region, segment, initiative_id null refs, stream, points int,
                 effective_date date, reason, ref_id int null, note text null, created_at, created_by
upload_batches   id, filename, file_hash unique, row_count, status, uploaded_by, created_at
api_keys         id, name, key_hash unique, scope ('read'|'write'), active bool default true,
                 last_used_at timestamptz null, created_by refs users, created_at
```

Indexes: `score_events(region, segment)`, `score_events(effective_date)`, `score_events(initiative_id)`, `entries(initiative_id, entry_date)`, `initiatives` trigram index on lower(title) (`CREATE EXTENSION pg_trgm`).

Integrity rules enforced in `scoring.ts`, not triggers:
- +1 new_initiative on create (after duplicate flow). `[V]`
- +1 entry per initiative per entry_date: checks for an existing non-reversed entry event with same initiative + effective_date before writing. `[V]`
- **(v1.2 `[A]`)** +2 bp_of_week and +2 best_presenter: **auto on submit when the box is ticked — no confirmation — each capped 1/Area/week** (skip if that Area already has one this week). `bp_of_week_confirmed_at` kept only as an audit stamp.
- Deletes / removals write compensating negative events (reason reversal), never remove rows. `[V]`

**v1.2 schema delta `[A]` (Phase 6):**
- New table `person` (id, name, active, created_by, created_at) — the PIC directory. `initiatives.pic` stays text; a typed/uploaded new name appends a `person` row (case-insensitive de-dup).
- `entries.best_presenter` boolean default false (mirrors `bp_of_week`).
- `ALTER TYPE pillar ADD VALUE 'CEE'` (additive, safe).
- `score_stream`: retire `cee`/`cee_best`, repurpose `presenter`→best_presenter. Postgres can't drop in-use enum values, so either migrate `score_events.stream` to a new 2-value enum or keep the type and stop writing/summing the retired values — **`[OPEN — enum strategy, owner: build engineer, decide at Phase 6 start]`**.
- Migration writes `reversal` events for all existing cee/cee_best/presenter rows (REQ-S5); **no raw deletes**. Full DB snapshot first (D16).
- Already shipped post-v1.1 (not in the v1.1 DDL above): `edit_log` and `api_keys`. `[V]`

## 4. API surface

All under `app/api/`. Auth middleware: `viewer` (any session), `admin`, `super`.

| Route | Method | Auth | Purpose |
|---|---|---|---|
| /api/auth/login | POST | - | viewer password OR admin credentials; rate-limited 5/10min/IP |
| /api/initiatives | GET | viewer | list + filters (region, segment, pillar, stage, category, q) + pagination |
| /api/initiatives | POST | admin | create (runs duplicate gate server-side) |
| /api/initiatives/[id] | GET/PATCH | viewer/admin | detail; edits logged, stage change writes stage_changes |
| /api/initiatives/[id]/entries | POST | admin | append entry (+ optional action item from follow_up) |
| /api/initiatives/duplicates | POST | admin | title -> top-3 candidates with similarity |
| /api/action-items/[id] | PATCH | admin | status/fields |
| /api/dashboard | GET | viewer | counters, stage summary, distributions, category split |
| /api/top-initiatives | GET | viewer | ?week=YYYY-Www or all-time |
| /api/leaderboard | GET | viewer | per-area stream sums; ?week= or all-time |
| /api/upload/template | GET | admin | generated xlsx (template.ts) |
| /api/upload/preview | POST | admin | file -> per-row validation + duplicate candidates + batch id |
| /api/upload/commit | POST | admin | batch id + per-row create/append choices -> all-or-nothing transaction |
| /api/admin/* | POST/PATCH | super | users, viewer password rotation, adjustments, API keys. **(v1.2 `[A]`)** removes bp-confirm + manual point streams; adds `/api/admin/people` (GET list, POST upload, PATCH deactivate) + `/api/admin/people/template` for the PIC directory |
| /api/v1/* | GET/POST | api key | public integration API (mirrors read routes; write = create initiative/append entry with 409 duplicate contract) |
| /api/openapi.json, /api/docs | GET | - | generated OpenAPI 3.1 spec + Scalar docs UI |
| /api/mcp | POST (streamable HTTP) | api key | MCP server: search_initiatives, get_initiative, get_top_initiatives, get_leaderboard, get_dashboard_summary, create_initiative, add_entry |

**v1.2 API deltas `[A]`:** the `bp_of_week`/`best_presenter` flags on `POST /api/initiatives` and `.../entries` now write the +2 immediately (subject to the 1/Area/week cap) instead of just setting a nomination flag. `GET /api/initiatives` gains a `%-done` field + filter. `POST /api/upload/preview` returns dedup candidates as today; commit adds bulk-resolution + a required `acknowledged` flag and persists PIC to the `person` directory. `GET /api/people` (viewer) powers the PIC picker's autocomplete.

## 5. Task breakdown (execute in order; do not start a phase before the previous gate passes)

### Phase 1: foundation + core CRUD

1.1 Scaffold Next.js + TypeScript + Tailwind + shadcn/ui + Drizzle + Vitest + Playwright. Docker compose for local Postgres with pg_trgm.
1.2 Implement `db/schema.ts` exactly per section 3; generate migration; seed script: enums are types, seed 2 admin users (1 super) + viewer password in app_config.
1.3 `week.ts`: weekStart/weekEnd/weekOf(date) in Asia/Jakarta, Monday-based. Pure, unit-tested first (DST-free but test year boundaries, e.g. 2026-12-28).
1.4 Auth: login page + iron-session + middleware for the 3 tiers + rate limiter.
1.5 Zod schemas in `validation/entry.ts` for initiative-create, entry-append (single source, reused in phase 3).
1.6 `duplicates.ts` + POST /duplicates: pg_trgm similarity > threshold (config, default 0.4), top 3, normalized lowercase/punctuation-stripped. Calibration test against the 45 fixture titles: known duplicate pairs must rank in the top 3.
1.7 Submit form (2-step: region/segment/title -> duplicate gate -> new vs append branches). Follow_up offers prefilled action item. BP-of-week checkbox labeled "nominate".
1.8 List page: table, filters, sort, search (title + description + entry detail), URL-encoded state, deep-linkable.
1.9 Detail page: header, description, entry timeline with category/BP badges, action items with inline status, stage control writing stage_changes.

**Gate 1:** unit tests for week.ts and validation schemas pass; Playwright: create initiative -> appears in list -> detail shows entry; duplicate flow both branches (append vs force-new); non-admin cannot reach /submit.

### Phase 2: scoring + dashboard + leaderboard

2.1 `scoring.ts`: single entry point `award(event)` + `reverse(eventId)`. Implements every rule in requirements section 5 including the 1/initiative/day cap on effective_date and presenter 1/area/week cap.
2.2 Wire scoring into create/append/delete paths (compensating events on delete).
2.3 Golden fixture `spark-45.ts`: the 45 real entries (Sulawesi -> nearest valid region, Core Excellence Execution -> Key Territory Execution, spellings normalized; mark corrections in the fixture file). **Golden test: replaying the fixture reproduces the real file's per-area Best Practice scores (2 x confirmed BP flags) exactly.**
2.4 Dashboard page + /api/dashboard: counters (Total/New/Existing per week.ts), stage summary, 3 distributions, category split. Every number links to the pre-filtered list.
2.5 Top initiatives (all-time + week selector with previous weeks).
2.6 Leaderboard page: rank, region, segment, 4 stream columns + total; top-3 highlight; ties share rank; week toggle; score cells click through to their event lists.

**Gate 2:** unit: all scoring rules incl. caps, backdating (cap applies to backdated date), reversal; golden test passes; property test: dashboard/leaderboard numbers always equal direct SUM queries; soft warning shown for entry_date > 30 days old.

### Phase 3: Excel template + bulk upload

3.1 `template.ts`: generates the versioned xlsx (Instructions, Entries with dropdown validations from live enum config, hidden Lists + _meta). Match KMS-Upload-Template.xlsx in this folder; that file is the reference output.
3.2 GET /upload/template + download buttons (Submit page, Admin).
3.3 Upload parser: exceljs -> rows -> shared Zod schemas; normalizer (ALL->All, Teens & ES->Teen & ES, case/whitespace); off-enum values produce per-row errors.
3.4 Preview endpoint: per-row status (valid / error+reason / possible-duplicate with top-3 candidates), stores batch as `previewed` with file hash; duplicate rows require explicit create/append choice in the UI.
3.5 Commit endpoint: single transaction, all-or-nothing, writes rows + score events via scoring.ts, marks batch `committed`. Re-upload of same hash blocked. Outdated template_version -> warning banner, not rejection.
3.6 Upload UI: dropzone -> preview table -> resolve duplicates -> commit -> result summary.

**Gate 3:** integration: file with 1 bad row commits nothing; duplicate-heavy file requires choices and respects them; same file twice -> blocked; points identical whether data enters by form or upload; 500-row file processes, 501 rejected.

### Phase 4: viewer gate + admin console + hardening

4.1 Viewer session flow end-to-end; logout-all on password rotation.
4.2 Admin settings: user management, viewer password rotation.
4.3 Weekly scoring console: pending BP nominations list -> confirm (writes +2); presenter/cee/cee_best entry per area per week (enforcing caps); adjustments with mandatory note.
4.4 Empty states (fresh install has zero data: dashboard, leaderboard, list all need friendly empty states since launch is empty per D5).
4.5 Backups (Neon PITR or pg_dump cron), deploy, HTTPS, env secrets audit.

**Gate 4:** Playwright journeys for all 3 roles; rate-limit test; nomination-without-confirm awards nothing; adjustment without note rejected; fresh-DB smoke test shows no crashes on empty data.

### Phase 5: integration API (OpenAPI + MCP, requirements section 14)

5.1 `api_keys` table + super-admin key management UI (create shows the key once; hashed at rest; revoke; scope read/write). Bearer middleware + per-key rate limiter (60 req/min default).
5.2 Public `/api/v1/*` read endpoints: thin wrappers over the existing services (initiatives list/detail/search, dashboard, top initiatives, leaderboard). No logic duplication.
5.3 Write endpoints: POST /api/v1/initiatives and /api/v1/initiatives/[id]/entries through the same Zod validation + scoring.ts. Duplicate contract: 409 + top-3 candidates unless `append_to` or `force_new` provided. created_by = key identity. BP flag = nomination only.
5.4 OpenAPI 3.1 generation from the Zod schemas (zod-openapi), served at /api/openapi.json; Scalar docs at /api/docs. CI check: spec builds and matches route inventory.
5.5 MCP server at /api/mcp (streamable HTTP, @modelcontextprotocol/sdk): the 7 tools listed in the API table, each calling the /api/v1 endpoints with the caller's key. Tool descriptions written for AI consumption (what the data means, enum values, example queries).
5.6 Never exposed via API/MCP: BP confirmation, manual point streams, adjustments, user management, password rotation (REQ-X3).

**Gate 5:** integration: read scope cannot write (403); 409 duplicate contract honored end-to-end incl. append_to and force_new; points identical for API-created vs form-created entries; revoked key rejected; openapi.json validates against OpenAPI 3.1 schema; smoke test: connect a Claude client to /api/mcp, run search_initiatives and add_entry successfully.

### Phase 6: v1.2 change batch (requirements section 6, decisions D9–D19) `[A]`

Full executable plan: **`KMS-v1.2-Epic-and-Plan.md`**. Ordered so the scoring/data migration lands behind a DB snapshot and a re-baselined golden test **before** any UI ships. This runs against a **live** system, so the migration steps are gated.

6.1 Schema: `person` table, `entries.best_presenter`, `pillar`+CEE, decide the `score_stream` enum strategy (§3 delta). Generate migration; do NOT apply to prod yet.
6.2 `scoring.ts` (test-first): 2-stream model — auto-award `bp_of_week` + `best_presenter` at +2, each capped 1/Area/week; delete the presenter/cee/cee_best award paths. Re-baseline the golden fixture to 2 streams.
6.3 Live-data migration script: snapshot → `reversal` events for every existing cee/cee_best/presenter row (net zero) → apply enum/table migration. No raw deletes. **Dry-run against a prod DB copy first.**
6.4 PIC directory: `person` service + `/api/admin/people` upload + `/api/people` autocomplete + Submit/edit picker + bulk-upload PIC persistence (D15).
6.5 Bulk dedup review: batch resolve + mandatory acknowledgment before commit (REQ-U9).
6.6 UI batch: side collapsible nav; dashboard (remove BP/Unlocking cards, Weekly Top Initiatives + PIC/stage); list (%-done column + filter, collapsed filters); detail (drop CEE tiles, drop BP badge, link-on-top, drop follow-up display); leaderboard (2 streams + drill-down pillar/PIC); Submit wording + Best-Presenter checkbox.

**Gate 6:** unit — 2-stream scoring incl. caps + no-backfill; migration reverses to net-zero and is idempotent; golden re-baselined. Integration — bulk dedup acknowledgment + PIC persisted from upload. E2E — auto-award on submit, PIC picker adds a person, side-nav collapse, %-done filter. Prod — snapshot taken, migration dry-run passed, live smoke after deploy.

## 6. Testing policy (applies to every phase)

- Scoring logic: test-first. Write the failing test from the requirements table, then implement.
- 4 domains covered: UI regressions (Playwright), API contracts (integration tests per route), business logic (unit tests in services/), E2E flows (role journeys).
- No mocking the database in scoring tests; use a test Postgres (Docker).
- The golden fixture is immutable; if a scoring change breaks it, the change is wrong or the requirements changed. Ask Levi.

## 7. Out of scope (do not build, V2 per requirements section 11)

Semantic/LLM dedup, server-side natural-language search, auto-digests, adopt-this-idea flow, binary file uploads, individual viewer accounts, admin CRUD for enums. (Note: AI clients can already query the KMS in V1 through the phase 5 MCP tools; V2's server-side LLM features build on the same endpoints.)
