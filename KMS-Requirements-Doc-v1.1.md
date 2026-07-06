# SPARK Knowledge Management System: requirements document v1.1

| | |
|---|---|
| Owner | Levi (Product Business Solutions Team) |
| Date | 2026-07-06 |
| Status | **Approved for development.** All decisions resolved (section 12), 2026-07-06. |
| Purpose | Source document for technical architecture and Claude Code task breakdown |
| Changes from v1.0 | Validated against the real SPARK WEEKLY UPDATE file (45 entries, 2 sheets). Score streams expanded from 2 to 4 (adds CEE, CEE Best per Levi). Leaderboard stays Region × Segment (per Levi; no person entity). Enums fixed to Levi's provided lists. Category resolved (Best Practice / Unlocking). Link field added to V1. Excel template fully specified with download requirement. |

## 1. Summary

A web app replacing the SPARK WEEKLY UPDATE spreadsheet. Up to 50 admins record marketing/sales knowledge entries (best practices and unlockings) against initiatives; up to 500 viewers browse, filter, and search them for reuse. Points from 4 streams (Best Practice, Presenter, CEE, CEE Best) roll up to an all-time leaderboard of Areas, where Area = Region × Segment.

Two ground truths shaped this version: the LLM council review (appendix A) and the real SPARK file (appendix B). Where the original proposal and the file disagree, this doc follows the file and flags the difference as an open decision.

## 2. Goals and non-goals

### Goals (V1)

1. One place to record and find all initiatives across 6 regions, 4 segments, and the pillar set.
2. Contribution habit: points reward logging best practices, surfacing unlockings, and weekly recognition.
3. Executive visibility: dashboard answers "how many, what stage, where" in under 10 seconds.
4. Fair, auditable scoring: every point traceable to an event; the leaderboard reproduces today's manual recap exactly.

### Non-goals (V1)

1. No LLM features. Duplicate detection is fuzzy string matching only (section 8). V2 roadmap in section 11.
2. No per-viewer accounts. Viewers share 1 password.
3. No user-editable master lists (regions, segments, pillars, territories change via code release or super-admin config, see D7).
4. No file uploads. Links (URLs) are supported; binary attachments are V1.1.
5. No mobile app. Responsive web only.

## 3. Users and access

| Role | Auth | Count | Can do |
|---|---|---|---|
| Viewer | Single shared password | up to 500 | Read all pages except Submit and Admin settings |
| Admin | Individual account (email + password) | < 50 | Everything a viewer can, plus submit/edit entries, initiatives, action items |
| Super-admin | Individual account, flag on admin | 2-3 | Everything an admin can, plus confirm BP-of-week nominations, log Presenter/CEE/CEE Best points, adjust scores, manage admin accounts, rotate viewer password |

Requirements:

- REQ-A1. Viewer password rotatable by super-admin without a deploy; rotation logs out all viewer sessions.
- REQ-A2. Every write stores `created_by`. Viewers have zero write access; no viewer audit trail. Deliberate trade-off.
- REQ-A3. BP-of-the-week confirmation and all manual point streams are super-admin only. Admins nominate; they cannot self-award (council finding).
- REQ-A4. Sessions: 30 days viewers, 7 days admins.
- REQ-A5. Rate-limit: 5 failed viewer-password attempts per IP per 10 minutes.

## 4. Data model

The contract for the whole system. Implement before any page. Field names in the real file map to these entities in section 7.3.

### 4.1 Enums (validated against real data)

Enums are Levi's provided lists (decision: proposal wins over file where they differ).

- **Region (5):** Jakarta Greater, Kalimantan, Sumatera, CJWJ, EJBN
- **Segment (4):** Halal PC, Teen & ES, Masstige, All
- **Pillar (5):** Social Buzz, Personalized CRM, Relevant Beauty Lifestyle, Activated New Touchpoint, Key Territory Execution

Import note: the historical file contains values outside these lists (Region "Sulawesi": 2 entries; Pillar "Core Excellence Execution": 3 entries; spellings "Teens & ES", "ALL"). The import normalizer maps spellings automatically (REQ-U8); off-enum values fail their row at dry-run preview with a clear error, and the uploader corrects them in the file. No system-side mapping (D5 resolved).
- **Entry category (2):** Best Practice, Unlocking
- **Stage (4):** Idea, Pilot, Running, Ready to Scale
- **Action status (4):** Not Started, On Progress, Done, Withdrawn/Cancelled
- **Score stream (4):** best_practice, presenter, cee, cee_best

### 4.2 Entities

**initiative** (the topic/tema; 1 row = 1 distinct topic)
- `id` auto-increment (the displayed Unique ID)
- `title` required, `description` optional (file has many blank descriptions)
- `region`, `segment`, `pillar` enums, required
- `stage` enum, default Idea (file confirms stage is never filled today; the app makes it required with a default so it can't be skipped)
- `pic` text, required (field person; NOT the score owner, see leaderboard_member)
- `link_url` optional (the file's "Link File" column)
- `tags` text array optional, `replicated_from` nullable FK (V2 seeds)
- `created_at`, `created_by`, `updated_at`

**entry** (renamed from v1.0 progress_update; 1 row of the SPARK file = 1 entry)
- `id`, `initiative_id` FK
- `entry_date` date, required (file: "Tanggal")
- `category` enum: Best Practice | Unlocking, required (resolves v1.0 open decision D3)
- `detail` text, required (file: "Progress")
- `follow_up` text, optional (file: "Need Follow Up Action/Unlocking"; also spawns an action_item when filled)
- `bp_of_week` boolean, default false. Admin-set = nomination; only super-admin confirmation scores it (REQ-A3)
- `link_url` optional
- `outcome_metric`, `outcome_value` optional (V2 seed)
- `created_at`, `created_by`, `upload_batch_id` nullable

**action_item**
- `id`, `initiative_id` FK, `due_date`, `description` required, `pic` required, `status` enum default Not Started
- `source_entry_id` nullable (when auto-created from an entry's follow_up)
- `created_at`, `created_by`, `updated_at`

**stage_change**
- `initiative_id`, `from_stage`, `to_stage`, `changed_at`, `changed_by`. Written on every stage edit.

**score_event** (the ledger; council verdict: event-sourced, no stored totals)
- `id`, `region` + `segment` (the owning Area, denormalized at event time), `initiative_id` nullable FK (null for manual weekly streams logged at area level)
- `stream` enum (4 values), `points` integer (negative allowed)
- `effective_date` date, required: the date the point counts for (= entry_date for entry events, grant date for manual streams). All weekly aggregations use effective_date, so backdated entries land in the correct week automatically.
- `reason` enum: new_initiative, entry, bp_of_week, presentation, cee_participation, cee_best, adjustment, reversal
- `ref_id` nullable, `note` required for adjustment/reversal
- `created_at`, `created_by`

**upload_batch**
- `id`, `filename`, `file_hash`, `row_count`, `status`: previewed | committed | rejected, `uploaded_by`, `created_at`

### 4.3 Definitions

- **Week:** Monday 00:00 to Sunday 23:59, Asia/Jakarta, hardcoded. (The real recap sheet is dated Monday 2026-07-06 covering entries through 2026-07-02; consistent.)
- **New initiative (dashboard):** created within the current week. **Existing:** before.
- **Top initiatives weekly:** ranked by SUM of score_event points linked to the initiative with effective_date in the selected week. Previous weeks selectable. Backdated entries recompute past weekly views; the ledger makes this exact, not approximate.
- **Area:** the (region, segment) pair; not a table. Up to 20 combos; only areas with ≥ 1 initiative appear on the leaderboard.
- **Score attribution:** every score event carries the Area (region, segment) of its initiative at event time; manual weekly streams are logged directly against an Area. Validation note: the scoring math was verified against the real file (BP-of-week flags × 2 pts reproduce every leaderboard row exactly when rolled up by territory).

## 5. Scoring rulebook

Reverse-engineered from the file, merged with Levi's proposed rules. Current live scoring only pays for BP-of-week (+2), CEE (+1), CEE Best (+2), Presenter (manual). Levi's +1 new / +1 progress rules are additions on top; D8 confirms them.

### 5.1 best_practice stream (automated + confirmed)

| Event | Points | Rule |
|---|---|---|
| New initiative created | +1 | Passes human-in-the-loop duplicate check (section 8). Confirmed (D8). |
| Entry added (Best Practice or Unlocking) | +1 | Max 1 point per initiative per calendar date, evaluated on entry_date (Asia/Jakarta). Backdated input allowed; the cap applies to the backdated date, and entries with entry_date > 30 days old get a soft warning at input/preview. Unlocking entries score equally: surfacing blockers is contribution. Confirmed (D2, D8). |
| BP of the week confirmed | +2 | Admin nominates via `bp_of_week`; super-admin confirms weekly. Matches today's practice (14 flags = 28 pts in the current file). |

### 5.2 Manual streams (super-admin logged, weekly cadence)

| Stream | Points | When |
|---|---|---|
| presenter | +2 per presentation, max 1 per area per week (D1 confirmed) | The Area's team presents at the weekly forum; logged against the Area |
| cee | +1 | Weekly CEE participation; logged against the Area |
| cee_best | +2 | Best CEE of the week; logged against the Area |

### 5.3 Ledger rules

- REQ-S1. No stored totals. Every displayed number is SUM over score_events.
- REQ-S2. Deletions/un-scoring write compensating negative events (reason `reversal`). History is never rewritten.
- REQ-S3. Super-admin manual `adjustment` events with mandatory note = the dispute mechanism.
- REQ-S4. If an initiative's region/segment is edited, future events carry the new Area; past events keep the Area recorded at event time. Simplest defensible rule; revisit if transfers become common.

## 6. Page requirements

### Page 0: Login
Viewer password OR admin email + password. Rate-limited (REQ-A5).

### Page 1: Home/Dashboard
1. Counters: Total, New (this week), Existing. Clickable through to pre-filtered List (council: no dead-end numbers).
2. Stage summary per stage, clickable.
3. Distribution: counts by Pillar, Region, Segment; every slice clickable.
4. Category split: Best Practice vs Unlocking counts (new in v1.1; "how many open unlockings" is a leadership question the file structure implies).
5. Top initiatives: all-time and weekly with week selector (previous weeks viewable).

Acceptance: loads < 2 s at 1,000 initiatives; aggregates equal ledger SUMs exactly.

### Page 2: Submit (admin only)
**Direct form:**
1. Step 1: Region, Segment, Title. On title blur, duplicate check (section 8).
2. Existing match confirmed: append mode. Read-only header, capture Entry (date, category, detail, follow_up, link). Earns entry points only.
3. New: capture PIC, Pillar, Stage (default Idea), Description, first Entry, optional tags/link. BP-of-week appears as a nomination checkbox only.
4. A filled `follow_up` offers to create an action_item (prefilled, editable).

**Bulk Excel upload:** section 7.

Acceptance: new initiative writes exactly 1 new_initiative event + up to 1 entry event; append writes entry events only; nomination alone writes no score event.

### Page 3: Initiative detail
1. Header: ID, title, stage badge, region/segment, pillar, PIC.
2. Description + link + metadata; admin-editable, edits logged.
3. Entry timeline, newest first: date, category badge (Best Practice / Unlocking), detail, follow_up, BP-of-week badge, entered-by.
4. Action items table with inline status updates (admin).
5. Stage control (admin) writing stage_change.
6. Points panel: totals per stream for this initiative, expandable event list.
7. `replicated_from` link when present.

### Page 4: List of initiatives
- Columns: ID, Region, Segment, Pillar, Title, Stage, plus open-unlocking indicator.
- Default sort ID ascending; all columns sortable.
- Filters: Region, Segment, Pillar, Stage, Category (has unlocking / best practice), multi-select, combinable, URL-encoded (shareable/deep-linkable).
- Search: title AND description AND entry detail (council: title-only search fails the reuse goal).

### Page 5: Area leaderboard (all-time)
- Top 3 areas highlighted.
- Table: Rank, Region, Segment, Score Presenter, Score Best Practice, Score CEE, Score CEE Best, Total. Ties share rank.
- Every score clicks through to its event list.
- Weekly view toggle (this week / previous weeks / all-time) so it replaces the manual Monday recap in the "Dashboard Final" sheet.
- Only areas with ≥ 1 initiative appear; segment "All" areas appear like any other (D4).

### Page 6: Admin settings (super-admin)
- Manage admin accounts.
- Rotate viewer password.
- Weekly scoring console: confirm BP-of-week nominations; log presenter/cee/cee_best points; post adjustments (note required).
- Download upload template (also available on Page 2).

## 7. Bulk Excel upload

### 7.1 Template download (explicit requirement)

- REQ-U0. The app provides a **Download template** button on the Submit page and Admin settings. The template is a versioned .xlsx generated from the current enum config, so dropdowns never drift from the app. Template version is stamped in a hidden sheet; uploads of outdated template versions get a warning, not a rejection.
- The v1 template ships with this doc: `KMS-Upload-Template.xlsx`. Form and template capture identical fields (single validation pipeline, REQ-U6).

### 7.2 Upload rules

- REQ-U1. 1 row = 1 entry (matching the SPARK file). New topics create an initiative + entry; recognized topics append an entry.
- REQ-U2. 2-phase: dry-run preview (per-row validation, per-row duplicate candidates, explicit create-new vs append-to-#ID choice for ambiguous rows), then all-or-nothing commit. No partial imports.
- REQ-U3. Idempotency: file hash stored per batch; re-upload of a committed file is blocked.
- REQ-U4. Row limit 500; larger files rejected with a message.
- REQ-U5. Committed rows carry `upload_batch_id`; a bad import is reversible via compensating events.
- REQ-U6. Form and Excel share 1 validation pipeline (Executor: or you'll write validation twice).
- REQ-U7. "Best Practices of The Week" column imports as a **nomination**, never as confirmed points (REQ-A3).
- REQ-U8. Enum normalization on import: "ALL"→All, "Teens & ES"→Teen & ES, case-insensitive region/pillar matching, trimmed whitespace. Values with no mapping (e.g. Sulawesi, Core Excellence Execution from the historical file) fail the row with a clear error at dry-run.

### 7.3 Template columns (= real SPARK file columns, mapped)

| Template column | Required | Maps to | Validation |
|---|---|---|---|
| Tanggal | yes | entry.entry_date | date |
| Region | yes | initiative.region | dropdown, 5 values |
| Segment | yes | initiative.segment | dropdown, 4 values |
| PIC | yes | initiative.pic | text |
| Pillar | yes (new topics) | initiative.pillar | dropdown, 5 values |
| Category | yes | entry.category | dropdown: Best Practice, Unlocking |
| Topic/Tema | yes | initiative.title (duplicate-checked) | text |
| Description | no | initiative.description | text |
| Progress | yes | entry.detail | text |
| Need Follow Up Action/Unlocking | no | entry.follow_up (+ optional action_item) | text |
| Stage | no (defaults Idea) | initiative.stage | dropdown, 4 values |
| Best Practices of The Week | no | entry.bp_of_week (nomination) | dropdown: TRUE, FALSE |
| Link File | no | entry.link_url | text/URL |

## 8. Duplicate (similar theme) detection

- REQ-D1. Fuzzy match on normalized title (lowercase, punctuation stripped) via trigram similarity (pg_trgm). Threshold starts at 0.4, configurable.
- REQ-D2. Never auto-merge. Top-3 candidates shown (title, territory, PIC, stage); admin picks "same as #ID" or "new".
- REQ-D3. Language: titles are Indonesian/English mixed with brand names and abbreviations (real examples: "Pop up store make over", "Beauty & The Heat - Make Over x Laboré x..."). No English stemming assumptions. Calibrate the threshold against the 45 real titles in the SPARK file before launch.
- REQ-D4. Wrong-merge recovery: super-admin detaches an entry and re-attaches elsewhere; score events follow via reversal + re-issue.

## 9. Non-functional requirements

- Stack (confirm at architecture stage): Next.js + PostgreSQL. Vercel + Neon/Supabase or internal server. SQLite for local POC only.
- Scale: 500 viewers, spiky around Monday recaps; ≤ a few thousand initiatives over 2 years. No cache layer.
- Timezone: Asia/Jakarta server-side for all date logic.
- Backup: daily automated, 30-day retention.
- Audit: score_events + created_by columns. No separate audit system.
- Security: argon2/bcrypt hashes, HTTPS only, rate-limited login, PII limited to ~50 admin names/emails + PIC names.

## 10. Operating model (post-launch ownership)

1. **System owner** (Levi or delegate): enum config, quarterly viewer-password rotation, backup checks.
2. **Score adjudicators** (super-admins): Monday scoring console session after each weekly forum (confirm BP-of-week, log presenter/cee points), dispute resolution via adjustment events.
3. **Data hygiene:** monthly stale review (no entry in 60 days: prompt PIC or move stage to Withdrawn); unlockings with no action item flagged weekly.
4. **Restructure rule:** if regions/segments reorganize, past events keep their recorded Area (REQ-S4); decide rebucketing then. The ledger makes either choice possible.

## 11. V2 roadmap (schema-ready, out of scope)

1. Semantic duplicate detection (embeddings) for mixed-language titles.
2. Natural-language search ("what worked for Teens & ES in Sumatera?").
3. Weekly auto-digest for leadership (stage crossings, open unlockings, top movers) replacing the manual Monday recap entirely.
4. "Adopt this idea" flow via `replicated_from` + replication points (reward ideas that travel).
5. Outcome analytics from entry outcome fields.
6. File attachments (binary), individual viewer accounts if justified.

## 12. Decisions (all resolved 2026-07-06; development unblocked)

| # | Decision | Status | Resolution |
|---|---|---|---|
| D1 | Presenter point value/cadence | **resolved** | +2 per presentation, max 1 per area per week |
| D2 | Entry point caps | **resolved** | 1 point per initiative per day, evaluated on entry_date. Backdated input allowed (cap applies to the backdated date; soft warning beyond 30 days). No weekly cap |
| D3 | Category taxonomy | **resolved** | Best Practice, Unlocking (from real file) |
| D4 | Segment "All" scoring | **resolved** | An "All" initiative counts only toward its (region, All) area; no double counting |
| D5 | Historical backfill | **resolved** | No system-side backfill. The app launches with an empty ledger; users upload historical data themselves later via the bulk Excel pipeline. Rows with off-enum values (Sulawesi, Core Excellence Execution) fail at dry-run preview with clear errors, and users correct them in the file before committing |
| D6 | Attachments | **resolved** | `link_url` field in V1 (file has a Link File column); binary uploads V1.1 |
| D7 | Enum lists | **resolved** | Levi's provided lists are final: 5 regions, 4 segments (Teen & ES), 5 pillars incl. Social Buzz. Sulawesi and Core Excellence Execution are historical-only values handled at import (D5) |
| D8 | Do the new +1 initiative / +1 entry rules apply, on top of today's BP-of-week/CEE scoring? | **resolved** | Yes: +1 new initiative and +1 entry/day apply in the best_practice stream, alongside BP-of-week (+2), Presenter, CEE, CEE Best |

## 13. Build phases for Claude Code

Test gates per phase are mandatory (unit tests for every scoring rule incl. caps and reversals; integration tests for the upload pipeline; E2E for submit and role journeys).

| Phase | Scope | Exit test gate |
|---|---|---|
| 1 | Schema + migrations, seed enums, admin auth, submit form incl. duplicate UI, List, Detail | E2E: create, find, view; duplicate flow both branches |
| 2 | score_events + triggers, Dashboard, Area leaderboard (weekly + all-time), week logic | Unit: all scoring rules; **golden test: a fixture built from the 45 real entries (off-enum values corrected) reproduces the file's per-area scores exactly**. Test data only; production launches empty (D5) |
| 3 | Template generator + download, 2-phase bulk upload | Integration: partial-failure file, duplicate-heavy file, re-upload block, outdated-template warning |
| 4 | Viewer gate, Admin settings + weekly scoring console, polish, backups | E2E all 3 roles; rate-limit; nomination-vs-confirm flow |
| 5 | Integration API: API keys, OpenAPI spec + docs, public read/write endpoints, MCP server (section 14) | Integration: scope enforcement, 409 duplicate contract, spec matches behavior; smoke test: connect from a Claude client and run search + add_entry |

The phase 2 golden test is the single most valuable test in the project: it proves the app's scoring engine against the team's own manual recap.

## 14. Integration API: OpenAPI and MCP

The KMS is a data source for other systems and AI tools, not a silo. Two integration surfaces, both thin layers over the same services the UI uses.

### 14.1 OpenAPI (REST for systems)

- REQ-X1. Every public endpoint is described by an auto-generated OpenAPI 3.1 document at `/api/openapi.json`, with human-readable docs at `/api/docs`. The spec is generated from the same Zod schemas used for form and Excel validation, so it can never drift from actual behavior.
- REQ-X2. Auth: bearer API keys. Super-admin creates, names, scopes, and revokes keys in Admin settings. Keys are hashed at rest; last-used timestamp tracked.
- REQ-X3. Scopes: `read` = initiatives, entries, action items, dashboard aggregates, leaderboard, search. `write` = create initiative, append entry (including BP nomination). API writes run through the same validation, duplicate policy, and scoring.ts pipeline as the UI, and record the key identity as created_by. Never exposed via API: BP-of-week confirmation, manual point streams, score adjustments, user management, password rotation. Those stay human, super-admin, in-app.
- REQ-X4. Duplicate policy for machine writes (human-in-the-loop, machine-enforced): if a new title has fuzzy candidates above threshold, the write is rejected with HTTP 409 and the top-3 candidates in the response body. The caller must retry with either `append_to: <id>` or `force_new: true`. Same rule the form enforces on humans.
- REQ-X5. Rate limit per key (default 60 req/min) and an audit trail of all API writes (created_by = key).

### 14.2 MCP (tools for AI clients)

- REQ-X6. An MCP server exposes the KMS to AI tools (Claude Desktop, Cowork, Claude Code, others) with these tools: `search_initiatives`, `get_initiative`, `get_top_initiatives`, `get_leaderboard`, `get_dashboard_summary`, and with a write-scoped key `create_initiative`, `add_entry`.
- REQ-X7. The MCP server is a thin client of the REST API (same keys, same scopes, same 409 duplicate contract), guaranteeing behavior parity. Transport: streamable HTTP at `/api/mcp`, so remote AI clients connect without extra hosting.
- REQ-X8. Example use this enables: "ask the KMS" from any Claude session ("what best practices exist for Teen & ES in Sumatera?") in V1 via search tools, before any V2 LLM features are built server-side.

## Appendix A: council review summary (v1.0)

Incorporated from the LLM Council review (5 advisors + anonymized peer review + synthesis; transcript separate): stage capture + ownership, event-sourced ledger with reversals, no self-awarding, entry point caps, human-in-the-loop dedup with Indonesian-text calibration, 2-phase idempotent Excel upload, clickable dashboard, widened search, V2 seed fields, operating model.

## Appendix B: real-file validation summary (v1.1)

Source: SPARK WEEKLY UPDATE.numbers (sheets: "Dashboard BP & Unlocking", 45 entries 2026-06-24 to 2026-07-02; "Dashboard Final", Monday recap dated 2026-07-06).

Verified findings: file data includes Sulawesi (2 entries) and pillar Core Excellence Execution (3 entries), both outside the final enums (handled at import, D5); Social Buzz absent from the 45 entries; category = Best Practice (32) / Unlocking (13); stage column exists but 100% empty; the file's recap sheet lists 11 named territory owners, but per product decision the app leaderboard is Region × Segment areas only; 41 distinct PICs are field staff; scoring reproduced: Best Practices column = 2 × confirmed BP-of-week flags per territory (all 11 rows match), CEE = +1, CEE Best = +2, Presenter manual cumulative.
