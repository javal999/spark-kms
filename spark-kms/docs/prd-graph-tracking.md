# PRD: knowledge graph + usage tracking (KMS Spark)

| | |
|---|---|
| Owner | Levi (PM) |
| Status | Draft for engineering review. Scoped to Phase 1; Phase 2 reserved. |
| Depth reference | `docs/research-graph-tracking.md` (read only if you want the why behind a choice) |
| Decisions applied | Graph edges: explicit + co-tag + replicated_from. Identity: pseudonymized. Tracking: build in-house. Phase 2 reserved: AI relations + heatmaps. |

This PRD stands alone. It assumes you have not read the research doc. Where the research left something open or assumed, it is carried here as an open question, not resolved by invention.

## 1. Problem statement

KMS Spark stores initiatives well but shows two blind spots.

You cannot see how initiatives relate. An activation that worked in CJWJ and a similar one in Sumatera sit as separate rows with no connection, even when they share tags or one was copied from the other. The schema already holds `tags` and a `replicated_from` link, but nothing reads them, so the reuse the KMS exists for stays manual and invisible.

You cannot see how the app is used. There is no record of which pages get opened, how often, or which actions people take. We are about to add a graph feature and have no way to measure whether anyone uses it. Today that question is unanswerable because no usage data is captured at all.

## 2. Target users and jobs

Viewers (up to 500, mostly read): "find initiatives related to the one I'm looking at, so I can reuse the idea in my area." Job the graph serves.

Admins and contributors (under 50): "see which of my initiatives connect to others, and link them." Job the graph serves on the write side.

Platform owner (Levi, primary consumer of tracking): "see which pages and actions get used, how usage trends, and whether a new feature gets adopted." Job the tracking dashboard serves. The owner is the main dashboard user; the tracking feature is not built to monitor individual employees (section 6).

## 3. Goals and success metrics

Several metrics are measured by the tracking feature itself, which does not exist yet. For those, the measurement method must ship as part of Phase 1, and a 2-week baseline is captured before we judge the graph.

| Goal | Success metric | Measurement source |
|---|---|---|
| Make initiative relationships visible | 60% of initiatives have at least 1 edge within 30 days of launch [A: target] | Query `initiative_links` (new table) |
| Drive reuse via the graph | The related-panel or graph explorer is opened on at least 20% of initiative-detail sessions [A: target] | Tracking: page_view + click events on the graph entry points |
| Prove the app is used, and how | Owner can answer all 4 usage questions (top pages, own frequency, top clicks, trends) from a live dashboard | Tracking dashboard over `usage_events` |
| Instrument before we judge | Tracking is live and has 14 days of baseline data before graph adoption is reported | `usage_events` row dates |
| Keep it private and light | Zero PII columns in the event store; raw events auto-deleted on the retention schedule | Schema review + retention job logs |

Note on circularity: goal 2 depends on goal 4's instrument being in place first. This is why tracking ships before or with the graph (section 5, dependencies).

## 4. User stories with acceptance criteria

Graph, Phase 1:

- As a viewer on an initiative detail page, I see a "Related initiatives" panel listing linked initiatives and a small graph. Acceptance: the panel shows backlinks (initiatives that link to this one) and forward links; each item opens that initiative's detail page; an initiative with no links shows an empty state, not an error.
- As an admin, I can link this initiative to another. Acceptance: I search and pick a target; the edge appears in both initiatives' panels; I can remove an edge I created; duplicate edges of the same type are rejected.
- As a viewer, co-tag relationships appear without anyone creating them. Acceptance: two initiatives sharing at least 1 tag show as connected with edge type `co_tag`; removing a shared tag removes the derived edge.
- As a viewer, I can open a global graph explorer. Acceptance: nodes are initiatives, filterable by region/segment/pillar; orphan initiatives (no edges) are visibly flagged; clicking a node opens its detail page. Explorer visibility (viewer vs admin-only) is open question Q6.

Tracking, Phase 1:

- As the owner, I see the most-accessed pages over a date range. Acceptance: a ranked list by `route_pattern`; dynamic routes like `/initiatives/[id]` are grouped, not split per id; date range selectable.
- As the owner, I see the most-clicked actions. Acceptance: ranked by tracked element; only elements marked with `data-track` are counted; each shows a human-readable label.
- As the owner, I see usage trends over time. Acceptance: a time series (day and week buckets) for page views and clicks, rendered in recharts.
- As the owner, I can see how often I personally access a page. Acceptance: filter the page metric to my own pseudonymized id; no equivalent view exists for other named individuals (section 6).

## 5. Scope and non-goals

Phase 1 in scope: `initiative_links` edge table (explicit + co_tag + replicated_from edges); backlinks list + ego graph on the detail page; global graph explorer with react-force-graph; `usage_events` table + `/api/events` ingest + client emitter (page views and `data-track` clicks); the 4-question tracking dashboard in recharts; pseudonymized identity; retention job and employee privacy notice.

Phase 1 non-goals: no click heatmaps; no AI-suggested relations; no session replay; no tracking of keystrokes, form values, or mouse trails; no per-named-employee dashboards; no graph edit history beyond who created an edge; no graph analytics algorithms (centrality, clustering).

Phase 2 reserved (schema leaves room, not built now): AI-derived relations via pgvector + embeddings with an admin-confirm step; click heatmap capture and heatmap.js rendering. Heatmap ROI is itself an open question given the app's size (Q in section 8).

Phase 3, not planned: adopt self-hosted PostHog only if tracking scope grows to funnels or replay; move the explorer to WebGL only if the graph crosses roughly 10k visible nodes.

## 6. UX notes

Graph entry points: the detail page (`app/(app)/initiatives/[id]/page.tsx`) gains a "Related initiatives" panel, where the backlinks list carries more day-to-day value than the picture. A new `/graph` route holds the global explorer with filters and orphan highlighting.

Tracking dashboard: a new owner-facing view (admin or super gated) with 4 sections matching the 4 questions, all recharts. Date-range control shared across sections.

Heatmap access (Phase 2): an admin-only overlay per page, rendered on demand; not surfaced to viewers.

Privacy posture in the UI: the dashboard shows aggregates and the owner's own activity. It never shows another named person's individual behavior. This is a product rule, enforced in queries, not just a policy line.

## 7. Dependencies

Tracking instrumentation must land before or with the graph, so the graph's adoption is measurable from day 1 (section 3, goals 2 and 4).

Reuses existing patterns: `score_events` (append-only ledger) as the model for `usage_events`; `duplicates.ts` (fuzzy match + human confirm) as the model for Phase 2 AI relations; `apiOps.ts` if any new capability is exposed to the API/MCP surface; recharts (already installed) for the dashboard.

External: react-force-graph (new dependency); pgvector (Phase 2, depends on deploy target, Q4); heatmap.js (Phase 2).

## 8. Open questions

| # | Question | Owner | Blocks |
|---|---|---|---|
| Q1 | Expected initiative count at 12 and 24 months (confirms the viz library ceiling) | Levi | Graph viz sizing |
| Q2 | Which buttons/actions get `data-track` attributes | Levi + eng | Tracking coverage |
| Q3 | Existing ParagonCorp employee-monitoring / privacy policy this must fit | Levi + IT/HR | Retention window, notice |
| Q4 | Deploy target (Vercel + Neon vs internal); affects pgvector availability | Eng + IT | Phase 2 AI relations |
| Q5 | Owner of the privacy notice + DPIA sign-off before tracking ships | Levi + IT/HR | Tracking launch |
| Q6 | Graph explorer visibility: viewer-facing or admin-only in Phase 1 | Levi | Explorer auth |
| Q7 | Heatmap ROI: is it worth building in Phase 2 on a 6-page mostly-read tool, or drop it | Levi | Phase 2 scope |
| Q8 | Success-metric targets marked [A] (60%, 20%) need owner confirmation | Levi | Metric baselining |

## 9. What this unblocks

With decisions applied and these 8 questions carried, the next step is the TRD (interview-mode, house standard), where an engineer verifies the design and signs the Design section. The TRD turns "an edge table in Postgres" into named columns, query shapes, and the ingest contract, with provenance tags on every technical claim.
