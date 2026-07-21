# SPARK Knowledge Management System: requirements document v1.2

| | |
|---|---|
| Owner | Levi (Product Business Solutions Team) |
| Date | 2026-07-10 (v1.2) |
| Status | **v1.2 approved for development.** v1.1 shipped — all 5 phases live in production at kms.paracorplabs.com. v1.2 = the change batch in the changelog below (decisions D9–D19). |
| Purpose | Source document for technical architecture and Claude Code task breakdown |
| Changes from v1.1 (v1.2) | **Scoring overhaul:** streams cut 4 → 2 (**Best Practice, Best Presenter**). The standalone per-initiative Presenter point and the **CEE / CEE-Best streams are removed**; **CEE becomes a 6th Pillar**. **Best Practice of the Week** and **Best Presenter of the Week** are now **auto-awarded +2 at submit with no super-admin confirmation** (this reverses REQ-A3 for these two awards), each capped **1/Area/week**. New: a **PIC people directory** (admin-uploadable, names only) driving a searchable PIC picker; typing a new name appends to the directory. Bulk upload now **persists PIC** and adds an **admin dedup-review with an acknowledgment gate**. UI: **side collapsible nav**, simplified list filters, **% action-items-done** column + filter, and assorted dashboard / detail / leaderboard changes (section 6). Existing CEE / CEE-Best / Presenter score events are reversed on migration. Full decision list: D9–D19 (section 12). |
| Changes from v1.0 | Validated against the real SPARK WEEKLY UPDATE file (45 entries, 2 sheets). Score streams expanded from 2 to 4 (adds CEE, CEE Best per Levi). Leaderboard stays Region × Segment (per Levi; no person entity). Enums fixed to Levi's provided lists. Category resolved (Best Practice / Unlocking). Link field added to V1. Excel template fully specified with download requirement. |

## 1. Summary

A web app replacing the SPARK WEEKLY UPDATE spreadsheet. Up to 50 admins record marketing/sales knowledge entries (best practices and unlockings) against initiatives; up to 500 viewers browse, filter, and search them for reuse. Points from **2 streams (Best Practice, Best Presenter)** roll up to a leaderboard of Areas, where Area = Region × Segment. (v1.1 had 4 streams; v1.2 removed the CEE/CEE-Best streams and the standalone Presenter point — see the changelog and section 5.)

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
| Super-admin | Individual account, flag on admin | 2-3 | Everything an admin can, plus adjust scores, manage admin accounts, rotate viewer password, upload the PIC people directory, manage API keys |

Requirements:

- REQ-A1. Viewer password rotatable by super-admin without a deploy; rotation logs out all viewer sessions.
- REQ-A2. Every write stores `created_by`. Viewers have zero write access; no viewer audit trail. Deliberate trade-off.
- REQ-A3. **(v1.2 revised.)** Best Practice of the Week and Best Presenter of the Week are now **self-serve**: an admin ticks the box at submit and the +2 lands immediately, no super-admin confirmation. Levi accepted the trade-off (loss of the council's no-self-award control) in exchange for weekly-cadence simplicity; the **1/Area/week cap on each award bounds the gaming risk** (D14). The only score control that stays super-admin-only is the manual `adjustment` (REQ-S3). *(v1.1 required super-admin confirmation for BP-of-week and forbade self-award; that is superseded for these two awards.)*
- REQ-A4. Sessions: 30 days viewers, 7 days admins.
- REQ-A5. Rate-limit: 5 failed viewer-password attempts per IP per 10 minutes.

## 4. Data model

The contract for the whole system. Implement before any page. Field names in the real file map to these entities in section 7.3.

### 4.1 Enums (validated against real data)

Enums are Levi's provided lists (decision: proposal wins over file where they differ).

- **Region (5):** Jakarta Greater, Kalimantan, Sumatera, CJWJ, EJBN
- **Segment (4):** Halal PC, Teen & ES, Masstige, All
- **Pillar (6, v1.2):** Social Buzz, Personalized CRM, Relevant Beauty Lifestyle, Activated New Touchpoint, Key Territory Execution, **CEE** (added in v1.2 — CEE is now a pillar, not a score stream; D10). Adding an enum value is an additive Postgres migration.

Import note: the historical file contains values outside these lists (Region "Sulawesi": 2 entries; Pillar "Core Excellence Execution": 3 entries; spellings "Teens & ES", "ALL"). The import normalizer maps spellings automatically (REQ-U8); off-enum values fail their row at dry-run preview with a clear error, and the uploader corrects them in the file. No system-side mapping (D5 resolved). *(v1.2 note: "Core Excellence Execution" can now be corrected to the CEE pillar rather than to Key Territory Execution.)*
- **Entry category (2):** Best Practice, Unlocking
- **Stage (4):** Idea, Pilot, Running, Ready to Scale
- **Action status (4):** Not Started, On Progress, Done, Withdrawn/Cancelled
- **Score stream (2, v1.2):** best_practice, best_presenter *(v1.1 had 4: presenter, cee, cee_best removed. The Postgres `score_stream` enum keeps the `presenter` value repurposed as "best_presenter" for the Best Presenter of the Week award; the `cee`/`cee_best` values are retired and their historical events reversed — D11, section 5.4.)*

### 4.2 Entities

**initiative** (the topic/tema; 1 row = 1 distinct topic)
- `id` auto-increment (the displayed Unique ID)
- `title` required, `description` optional (file has many blank descriptions)
- `region`, `segment`, `pillar` enums, required
- `stage` enum, default Idea (file confirms stage is never filled today; the app makes it required with a default so it can't be skipped)
- `pic` text, required (field person; NOT the score owner). **(v1.2)** Backed by the new **`person` directory** (D9): Submit and detail-edit show a searchable picker sourced from `person.name`; typing a name not on the list creates a `person` row and uses it. Stored as denormalized text for display + backward compatibility, soft-linked to the directory. Bulk upload persists PIC and appends new names to the directory (fixes the v1.1 bug where bulk PIC was dropped, D15).
- `link_url` optional (the file's "Link File" column)
- `tags` text array optional, `replicated_from` nullable FK (V2 seeds)
- `created_at`, `created_by`, `updated_at`

**person** (v1.2, new — the PIC directory)
- `id`, `name` required unique-ish (case-insensitive de-dup), `active` boolean default true, `created_at`, `created_by`
- Not a login account (distinct from `users`). Names only; email optional/future. Uploaded by super-admin via a names-only template, or grown implicitly when a new PIC name is typed on Submit or arrives via bulk upload.

**entry** (renamed from v1.0 progress_update; 1 row of the SPARK file = 1 entry)
- `id`, `initiative_id` FK
- `entry_date` date, required (file: "Tanggal")
- `category` enum: Best Practice | Unlocking, required (resolves v1.0 open decision D3)
- `detail` text, required (file: "Progress")
- `follow_up` text, optional (file: "Need Follow Up Action/Unlocking"; also spawns an action_item when filled)
- `bp_of_week` boolean, default false. **(v1.2)** Ticking it **auto-awards +2 immediately** at submit — no confirmation (D14) — to the best_practice stream, capped 1/Area/week. `bp_of_week_confirmed_at` is retained only as an audit stamp of when the auto-award fired.
- `best_presenter` boolean, default false. **(v1.2, new)** "Best Presenter of the Week" — same mechanics: auto-awards +2 at submit, no confirmation, capped 1/Area/week, to the **best_presenter** stream.
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
- `stream` enum (**2 values, v1.2**: best_practice, best_presenter), `points` integer (negative allowed)
- `effective_date` date, required: the date the point counts for (= entry_date for entry/BP/Best-Presenter events; grant date for adjustments). All weekly aggregations use effective_date, so backdated entries land in the correct week automatically.
- `reason` enum (**v1.2**): new_initiative, entry, bp_of_week, best_presenter, adjustment, reversal *(v1.1's presentation, cee_participation, cee_best reasons are retired)*
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

## 5. Scoring rulebook (v1.2)

Two streams. Every point comes from one of four events; there are no manual weekly point streams anymore (CEE removed, standalone Presenter removed). The ledger rules (5.3) are unchanged; a one-time migration (5.4) reverses the retired-stream events on live data.

### 5.1 best_practice stream

| Event | Points | Rule |
|---|---|---|
| New initiative created | +1 | After the human-in-the-loop duplicate check (section 8). |
| Entry added (Best Practice or Unlocking) | +1 | Max 1 point per initiative per calendar date, on entry_date (Asia/Jakarta). Backdated input allowed (cap applies to the backdated date; soft warning beyond 30 days). Unlocking scores equally — surfacing blockers is contribution. |
| Best Practice of the Week | +2 | Checkbox at submit (`bp_of_week`). **Auto-awarded immediately, no confirmation** (D14). Capped **1 per Area per week** — the first ticked entry in an Area that week scores; later ones in the same Area/week are skipped (`area-week-cap`). |

### 5.2 best_presenter stream (v1.2, new)

| Event | Points | Rule |
|---|---|---|
| Best Presenter of the Week | +2 | Checkbox at submit (`best_presenter`). **Auto-awarded immediately, no confirmation** (D12, D14). Capped **1 per Area per week**. Rendered as the leaderboard's "Best Presenter" column. |

Removed in v1.2: the standalone per-initiative **Presenter +2** (D12 — every initiative is presented, but the point that rewards presentation is now the weekly "Best Presenter" award, not a per-initiative auto-point) and the **CEE / CEE-Best** streams (D10/D11 — CEE is now a Pillar).

### 5.3 Ledger rules (unchanged)

- REQ-S1. No stored totals. Every displayed number is SUM over score_events.
- REQ-S2. Deletions/un-scoring write compensating negative events (reason `reversal`). History is never rewritten.
- REQ-S3. Super-admin manual `adjustment` events with a mandatory note = the dispute mechanism. This is the **only** remaining super-admin-gated score action.
- REQ-S4. If an initiative's region/segment is edited, future events carry the new Area; past events keep the Area recorded at event time.

### 5.4 v1.2 migration (one-time, on live data)

- REQ-S5. Stream removal goes through the ledger, never a raw DELETE (REQ-S2). For every existing `cee`, `cee_best`, and `presenter` score event, write a compensating `reversal` event (net zero). Rows remain for audit; the leaderboard stops counting them. Past area totals drop accordingly — accepted (D16).
- REQ-S6. **No retroactive award.** Existing initiatives do NOT get back-dated Best-Practice-of-Week or Best-Presenter points; only entries submitted from v1.2 onward earn them. Existing `bp_of_week`-nominated-but-unconfirmed entries are NOT auto-awarded (D13).
- REQ-S7. Take a full DB snapshot before the migration (D16). The phase-2 golden test must be re-baselined to the 2-stream model (or quarantined) before this ships.

## 6. Page requirements

**Navigation (v1.2, item 1, D17):** the primary nav moves from a top bar to a **collapsible left sidebar** — an icon-rail when collapsed, full labels when expanded; the collapsed/expanded state persists per user; a drawer on mobile. Applies to every authenticated page. (The admin section directory's sticky offset must be re-anchored to the new layout.)

### Page 0: Login
Viewer password OR admin email + password. Rate-limited (REQ-A5).

### Page 1: Home/Dashboard
1. Counters: Total, New (this week), Existing. Clickable through to pre-filtered List (no dead-end numbers).
2. Stage summary per stage, clickable.
3. Distribution: counts by Pillar (now incl. CEE), Region, Segment; every slice clickable. **(v1.2, item 9)** the "Has a Best Practice" and "Has an Unlocking" cards are removed.
4. **Weekly Top Initiatives (v1.2, items 10–11):** renamed from "Top initiatives", **defaults to the current week** (week selector retained for previous weeks). Each row also shows **PIC and Stage** alongside title and points.

Acceptance: loads < 2 s at 1,000 initiatives; aggregates equal ledger SUMs exactly.

### Page 2: Submit (admin only)
**Direct form:**
1. Step 1: Region, Segment, Title. On title blur, duplicate check (section 8).
2. Existing match confirmed: append mode. Read-only header, capture Entry (date DD/MM/YYYY, category, detail, follow_up, link). Earns entry points only.
3. New: capture **PIC via the searchable directory picker (v1.2, item 2 — type a name not on the list to add it)**, Pillar (incl. CEE), Stage (default Idea), Description, first Entry, optional tags/link.
4. **(v1.2, items 5–6)** Two weekly checkboxes: **"Best Practice of the Week"** and **"Best Presenter of the Week."** Ticking either **auto-awards +2 immediately** (no confirmation, capped 1/Area/week). Wording changed from "nominate for…".
5. A filled `follow_up` offers to create action item(s); a multi-line / numbered follow-up splits into several.

**Bulk Excel upload:** section 7.

Acceptance: new initiative writes exactly 1 new_initiative + up to 1 entry event; append writes entry events only; a ticked Best-Practice / Best-Presenter box writes +2 immediately, subject to the 1/Area/week cap.

### Page 3: Initiative detail
1. Header: ID, title, stage badge, region/segment, pillar, PIC. **(v1.2, item 16)** the docs/project **link shows at the top, above the description**, as a labeled "View doc ↗" affordance.
2. Description + metadata; admin-editable, edits logged (admin-only edit history rendered as a GitHub-style word diff).
3. Entry timeline, newest first: date, detail, entered-by. **(v1.2, item 15)** the "Best Practice" category badge is removed (the "Unlocking" badge is kept as a useful flag); BP-of-week / Best-Presenter badges remain. **(v1.2, item 17)** the "follow-up" display block is removed — follow-ups surface as action items (the follow-up field on Submit still feeds them).
4. Action items table (admin: inline status + edit): description with Read-more, PIC, due, status — no horizontal scroll.
5. Stage control (admin) writing stage_change.
6. Points panel: **(v1.2, item 14)** the CEE and CEE-Best tiles are removed — shows Best Practice + Best Presenter + Total (Total = sum of the two visible streams).
7. `replicated_from` link when present.

### Page 4: List of initiatives
- Columns: ID, Region, Segment, Pillar, Title, Stage, open-unlocking indicator, plus **(v1.2, item 12)** a **% action-items-done** column (done ÷ total; 0-action-item initiatives show "—").
- Default sort ID ascending; all columns sortable.
- **Filters (v1.2, item 13):** collapsed into a **"Filters" panel/popover** with active-filter chips shown inline — not all controls expanded at once. Adds a **% done** filter (buckets: 0% / in-progress / 100%; "—" excluded). Region, Segment, Pillar, Stage, Category filters stay multi-select, combinable, URL-encoded (deep-linkable — dashboard cards link into them).
- Search: title AND description AND entry detail.

### Page 5: Area leaderboard
- Top 3 areas highlighted.
- Table (**v1.2**): Rank, Region, Segment, **Best Practice, Best Presenter, Total** (CEE / CEE-Best columns removed). Ties share rank.
- Every score clicks through to its event list; weekly view toggle (this week / previous weeks / all-time).
- Only areas with ≥ 1 initiative appear; segment "All" areas appear like any other (D4).
- **(v1.2, item 18)** the area **drill-down page** additionally shows each initiative's **Pillar and Contributor (PIC)**. Pillar/PIC are per-initiative, so they live in the drill-down, not as columns on the area-aggregate row (D18).

### Page 6: Admin settings (super-admin)
- A **sticky section directory** jumps between the panels below.
- Manage admin accounts; manage API keys.
- Rotate viewer password.
- **(v1.2)** Scoring console: **only adjustments remain** (note required). BP-of-week confirmation and the manual presenter / cee / cee_best logging are gone — those awards are now auto (section 5) or removed.
- **(v1.2, item 2)** **PIC directory:** upload a names-only list (template provided); view / deactivate entries. New names typed on Submit or arriving via bulk upload are appended automatically.
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
- REQ-U7. **(v1.2)** The "Best Practice of the Week" column now imports as an **auto-award +2** (capped 1/Area/week), matching the form (D14). A new **"Best Presenter of the Week"** column does the same for the best_presenter stream. Because a sheet could tick these on every row, the per-Area/week cap is the guardrail and the REQ-U9 acknowledgment makes the admin own the import. *(v1.1 imported this column as a nomination only; superseded.)*
- REQ-U8. Enum normalization on import: "ALL"→All, "Teens & ES"→Teen & ES, case-insensitive region/pillar matching, trimmed whitespace. Values with no mapping (e.g. Sulawesi) fail the row with a clear error at dry-run. *(v1.2: "Core Excellence Execution" now maps to the CEE pillar.)*
- REQ-U9. **(v1.2, item 8)** Bulk dedup review: the preview already flags per-row duplicate candidates. Add **batch actions** — "treat all flagged as new", "append all to the top match", "reject all" (uses the `rejected` batch status), or resolve individually — and a **mandatory acknowledgment** checkbox ("I reviewed the N similar initiatives") the admin must tick before commit.
- REQ-U10. **(v1.2, item 7)** Bulk upload **persists PIC**: the row PIC saves on the initiative and is appended to the `person` directory (D9/D15); action items created from a row's follow_up inherit the row PIC instead of "Unassigned".

### 7.3 Template columns (= real SPARK file columns, mapped)

| Template column | Required | Maps to | Validation |
|---|---|---|---|
| Tanggal | yes | entry.entry_date | date, **DD/MM/YYYY** (all cells formatted; v1.2) |
| Region | yes | initiative.region | dropdown, 5 values |
| Segment | yes | initiative.segment | dropdown, 4 values |
| PIC | yes | initiative.pic (+ `person` directory, v1.2) | text; matched/appended to the directory |
| Pillar | yes (new topics) | initiative.pillar | dropdown, **6 values** (incl. CEE, v1.2) |
| Category | yes | entry.category | dropdown: Best Practice, Unlocking |
| Topic/Tema | yes | initiative.title (duplicate-checked) | text |
| Description | no | initiative.description | text |
| Progress | yes | entry.detail | text |
| Need Follow Up Action/Unlocking | no | entry.follow_up (+ optional action_item, PIC inherited) | text |
| Stage | no (defaults Idea) | initiative.stage | dropdown, 4 values |
| Best Practice of the Week | no | entry.bp_of_week (**auto +2**, v1.2) | dropdown: TRUE, FALSE |
| Best Presenter of the Week | no | entry.best_presenter (**auto +2**, v1.2, new) | dropdown: TRUE, FALSE |
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
| D8 | Do the new +1 initiative / +1 entry rules apply, on top of today's BP-of-week/CEE scoring? | **resolved** | Yes: +1 new initiative and +1 entry/day apply in the best_practice stream. *(v1.2: still true, but "alongside CEE/Presenter" no longer holds — those streams are removed.)* |

### v1.2 decisions (2026-07-10; supersede parts of D1/D7/D8/REQ-A3)

| # | Decision | Status | Resolution |
|---|---|---|---|
| D9 | PIC entry method | **resolved** | A **`person` directory** (names only, not logins). Submit shows a searchable picker; a new name creates a `person` row and is used. Bulk upload appends new names. |
| D10 | Where does CEE live | **resolved** | CEE becomes a **6th Pillar** value (additive enum). It is no longer a score stream. |
| D11 | CEE / CEE-Best score streams | **resolved** | **Removed.** Enum `cee`/`cee_best` retired; existing events **reversed** (REQ-S5). Leaderboard drops to 2 streams. |
| D12 | Standalone Presenter point (v1.1 item 3) | **resolved** | **Removed.** The reward for presenting is the weekly **Best Presenter of the Week** (+2), not a per-initiative auto-point. The `presenter` enum value is repurposed to the best_presenter stream. |
| D13 | Retroactive awards | **resolved** | **No backfill.** Only entries from v1.2 onward earn BP/Best-Presenter points. Existing nominated-but-unconfirmed entries are NOT auto-awarded. |
| D14 | Confirmation for the two weekly +2 awards | **resolved** | **Auto-award at submit, no super-admin confirmation** (form + bulk). Bounded by a **1/Area/week cap** on each. Supersedes REQ-A3 for these two awards; Levi accepted the self-award trade-off. |
| D15 | Bulk-upload PIC | **resolved** | Persist the row PIC on the initiative + append to directory; action items inherit the row PIC. Fixes the v1.1 drop. |
| D16 | Migration data policy | **resolved** | Reversing CEE/presenter events **shifts historical leaderboard numbers** — accepted. Full DB snapshot taken before migration. Golden test re-baselined to 2 streams. |
| D17 | Navigation | **resolved** | Collapsible left **sidebar** (icon-rail + drawer on mobile), state persisted. |
| D18 | Leaderboard Pillar/PIC | **resolved** | Shown in the **area drill-down** (per initiative), not as columns on the area-aggregate row. |
| D19 | "% action items done" edge cases | **resolved** | 0-action-item initiatives show "—" and are excluded from the % filter. Filter buckets: 0% / in-progress / 100%. |

## 13. Build phases for Claude Code

Test gates per phase are mandatory (unit tests for every scoring rule incl. caps and reversals; integration tests for the upload pipeline; E2E for submit and role journeys).

| Phase | Scope | Exit test gate |
|---|---|---|
| 1 | Schema + migrations, seed enums, admin auth, submit form incl. duplicate UI, List, Detail | E2E: create, find, view; duplicate flow both branches |
| 2 | score_events + triggers, Dashboard, Area leaderboard (weekly + all-time), week logic | Unit: all scoring rules; **golden test: a fixture built from the 45 real entries (off-enum values corrected) reproduces the file's per-area scores exactly**. Test data only; production launches empty (D5) |
| 3 | Template generator + download, 2-phase bulk upload | Integration: partial-failure file, duplicate-heavy file, re-upload block, outdated-template warning |
| 4 | Viewer gate, Admin settings + weekly scoring console, polish, backups | E2E all 3 roles; rate-limit; nomination-vs-confirm flow |
| 5 | Integration API: API keys, OpenAPI spec + docs, public read/write endpoints, MCP server (section 14) | Integration: scope enforcement, 409 duplicate contract, spec matches behavior; smoke test: connect from a Claude client and run search + add_entry |
| **6 (v1.2)** | Scoring overhaul (2 streams, auto-awards + caps, live-data migration), CEE→pillar, `person` directory + PIC picker, bulk dedup review + PIC persistence, side collapsible nav, dashboard/list/detail/leaderboard changes (section 6) | Unit: 2-stream scoring incl. auto-award 1/Area/week caps + no-backfill; migration reverses CEE/presenter to net-zero (no raw deletes); golden test re-baselined. Integration: bulk dedup review + acknowledgment, PIC persisted from upload. E2E: submit auto-award, PIC picker adds a person, side-nav collapse, %-done filter. Prod: DB snapshot before migration; smoke-test live after deploy. |

Phases 1–5 shipped (live in production). Phase 6 is the v1.2 batch; its executable plan is `KMS-v1.2-Epic-and-Plan.md`. The phase 2 golden test remains the single most valuable test — re-baseline it to the 2-stream model, never silently break it (D16).

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
