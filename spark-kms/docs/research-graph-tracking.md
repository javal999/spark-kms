# Research & implementation plan: knowledge graph + usage tracking

| | |
|---|---|
| Repo | KMS Spark (`spark-kms/`), Next.js 16 App Router, Drizzle + Postgres |
| Author | Levi (PM), with Claude Code codebase inspection + web research |
| Status | Research draft. Ends with 5 decisions needed before a PRD. |
| Scale assumption | Hundreds to low-thousands of initiatives over 2 years (per requirements v1.1 NFRs), <50 contributors, up to 500 viewers. [A] node count under ~3,000. |

Provenance tags: `[A]` = assumed, not verified. Every external claim carries a source URL (section 13). Codebase claims carry a real file path.

---

## 1. Codebase findings (what exists today)

The app is further along than a greenfield. Both features have real anchors and, for the graph, two latent-but-unused hooks.

**Stack.** `next@16.2.10`, `react@19.2.4`, `drizzle-orm@0.45.2` on `postgres@3.4.9` (postgres-js), Tailwind v4, shadcn, `lucide-react`. Tests: `vitest@4.1.9` + `@playwright/test`. Source: `spark-kms/package.json`.

**Charting is already installed:** `recharts@3.9.2`. Reusable for the tracking dashboard. It is not a network-graph library, so the graph feature still needs a dedicated one.

**MCP + OpenAPI already wired:** `@modelcontextprotocol/sdk@1.26.0` + `mcp-handler@1.1.0`, server at `app/api/mcp/route.ts`, 7 tools in `src/services/mcpTools.ts`, spec at `app/api/openapi.json/route.ts`. Both `/api/v1/*` and MCP funnel through `src/services/apiOps.ts`. Any new API-exposed capability is added there once, not twice.

**Data model** (`src/db/schema.ts`, migrations in `src/db/migrations/`):

- `initiatives`: id, title, description, region, segment, pillar, stage, pic, linkUrl, **`tags` text[]**, **`replicatedFrom` self-FK**, timestamps. GIN trigram index on `lower(title)`.
- `entries`: progress records belonging to an initiative (entryDate, category Best Practice/Unlocking, detail, followUp, bpOfWeek flags, outcome fields).
- `action_items`, `stage_changes`, `score_events` (append-only ledger, totals never stored), `upload_batches`, `api_keys`, `edit_log`, `people`.

**Two latent graph hooks, both inert today:**

- `initiatives.tags` (text[]) is written (create form, admin edit, validated in `src/validation/entry.ts:78`) but never read, queried, or filtered anywhere. `listInitiatives` has no tag filter. Dormant on the read side.
- `initiatives.replicatedFrom` (self-referential FK, `src/db/schema.ts:141`) exists in the schema and nowhere else. Never written, read, or exposed. This is the closest thing to an initiative-to-initiative edge and it is completely unused.

No `links` / `relations` / `backlinks` join table exists. No graph query, traversal, or visualization code exists. The graph is greenfield on the read/UI side, with the schema already holding two useful seeds.

**Auth.** `iron-session@8`, sealed cookie `spark_session`, 3 roles (viewer/admin/super) in `src/lib/session-config.ts`. Edge gate in `proxy.ts` (Next 16 renamed `middleware` to `proxy`); fine-grained checks via `src/lib/guards.ts`.

**Services.** `scoring.ts` is the only writer of `score_events` (append-only, compensating reversals) — the exact pattern to copy for a usage-event ledger. `duplicates.ts` does pg_trgm fuzzy matching with a human-confirm step — the exact pattern to copy for AI-suggested relations. `week.ts` is Asia/Jakarta week math. `scores.ts` holds read aggregations.

**Tracking: nothing exists.** No analytics library, no `instrumentation.ts`, no event table, no `sendBeacon`, no click logging. `score_events` tracks scoring, not usage. Client interactivity is plain React `onClick`/`fetch` in ~16 `"use client"` components. The whole usage pipeline is greenfield. The natural home for a per-initiative graph panel is `app/(app)/initiatives/[id]/page.tsx`.

---

## 2. Graph: relation data model options + recommendation

The question is not "graph DB or not" in the abstract. It is: at low-thousands of nodes, does a graph DB earn its operational cost over an edge table in the Postgres we already run?

| Option | Pros | Cons | Cost/effort |
|---|---|---|---|
| A. Edge table in existing Postgres (`initiative_links`) | No new infra; joins to initiatives are trivial; backlinks/n-hop via recursive CTE; reuses backups, auth, migrations | Recursive CTEs are more verbose than Cypher; very deep traversals (6+ hops) get slower | Low. 1 migration + queries |
| B. Apache AGE (Postgres graph extension) | openCypher inside the same Postgres, no separate DB | Extension to install/maintain on Neon/Supabase [A: managed support varies]; team learns Cypher for little gain at this scale | Medium |
| C. Dedicated graph DB (Neo4j / FalkorDB) | Index-free adjacency, constant-time hops, mature graph tooling | A second datastore to run, sync, secure, and back up; sync pipeline from Postgres; overkill below ~10^5 nodes | High |
| D. No table; derive edges on the fly from `tags[]` + `replicatedFrom` | Zero schema change | Co-tag joins get expensive; no place for user-created or confirmed edges; can't store edge type/weight | Low but a dead end |

Graph databases win when low-latency deep traversal at large scale is the core workload (recommendation engines, logistics, fraud). Moving to one shifts relationship resolution from query time to insert time and adds a system to operate. At our scale that trade buys nothing. Postgres with an adjacency/edge table (optionally Apache AGE later) covers graph queries without a separate database or sync pipeline (sources §13.1).

**Recommendation: Option A.** Add one `initiative_links` edge table in the existing Postgres:

```
initiative_links
  id, src_id -> initiatives, dst_id -> initiatives,
  type enum: explicit | replicated_from | co_tag | derived_similar,
  weight numeric null,          -- for future AI edges
  created_by, created_at,
  unique (src_id, dst_id, type)
```

Edge sources for Phase 1: explicit user-created links; activate the inert `replicatedFrom` as a `replicated_from` edge; and derive `co_tag` edges from the already-stored `tags[]` (this finally makes tags do something on the read side). Traversal queries: backlinks (`WHERE dst_id = ?`), n-hop neighbors (recursive CTE with a depth cap of 2 to start), orphan nodes (initiatives with no row in `initiative_links`). Keep AI-derived edges (`derived_similar`) out of Phase 1; the table's `type` and `weight` columns leave room so Phase 2 needs no migration.

---

## 3. Graph: visualization options + recommendation

Recharts (already installed) does bar/line/area charts, not node-link networks. A dedicated library is required.

| Library | Rendering | Fit for us | Cons | Bundle [A] |
|---|---|---|---|---|
| react-force-graph (2D) | Canvas | React-native API, force layout out of the box, easy ego-graph + global view, fine to a few thousand nodes | Not WebGL by default; labels get busy past ~5k | ~mid, [A] ~150 KB min+gz |
| Cytoscape.js | Canvas/SVG | Richest layouts + graph analysis algorithms | Heavier API; performance degrades near ~10k nodes on SVG/Canvas (source §13.2); React wrapper is a layer | [A] larger |
| Sigma.js + graphology | WebGL | Best for very large graphs (10k+) | WebGL + graphology data layer is more setup than we need at our scale (source §13.2) | [A] mid |
| Plain D3 force | SVG | Total control | You hand-build zoom, drag, labels, perf tuning | Small core, high build cost |

Guidance across sources is consistent: pick WebGL (Sigma) only when the graph is large enough that WebGL and a graphology layer matter more than built-in features; Cytoscape for analysis; and do not trust universal node-count benchmarks — test your own graph shape (source §13.2).

**Recommendation: react-force-graph (2D/Canvas).** At our node count it renders comfortably, the React API keeps build cost low, and it serves both entry points: a per-initiative ego graph (1-2 hops) on the detail page, and a global explorer page. Revisit Sigma only if the global graph crosses ~10k visible nodes, which our scale does not reach in the planning horizon. Two entry points:

1. **Detail-page "Related initiatives" panel** at `app/(app)/initiatives/[id]/page.tsx`: a small ego graph plus a plain backlinks list (the list matters more than the picture for reuse).
2. **Global explorer** at a new `/graph` route: filter by region/segment/pillar, highlight orphans, click a node to open its detail page.

---

## 4. Graph: AI-derived relations (why it's Phase 2)

Approach: embed each initiative's title + description + entry text with an embedding model, store vectors in Postgres via `pgvector`, and for each initiative surface the top-k nearest by cosine similarity as **suggested** `derived_similar` edges. An admin confirms or dismisses each suggestion, exactly mirroring the existing `duplicates.ts` human-in-the-loop flow. Confirmed suggestions become real edges; dismissed ones are suppressed.

Cost: embedding a few thousand short documents is a one-time batch plus incremental on write. [A] well under a few dollars at current embedding prices for this corpus size. `pgvector` is one extension in the DB we already run; no new datastore. This also lands directly on the V2 LLM roadmap already in the requirements doc (semantic dedup, natural-language search share the same vectors).

Why Phase 2, not Phase 1: explicit relations must exist and prove useful before we add probabilistic ones; suggestions with no confirm flow become noise; and the value of "related" edges depends on having tags/links populated first. The edge table from section 2 already reserves `type=derived_similar` and a `weight` column, so Phase 2 is additive with no migration to the edge model.

---

## 5. Tracking: event schema

One append-only table, `usage_events`, mirroring the `score_events` ledger pattern. No PII columns.

| Field | Type | Example | Why |
|---|---|---|---|
| id | bigserial | 90218 | PK |
| event_type | enum | `page_view` \| `click` | The two things we capture in Phase 1 |
| path | text | `/initiatives/142` | Which page; the route, id-normalized for aggregation (see below) |
| route_pattern | text | `/initiatives/[id]` | Groups dynamic routes so counts aren't fragmented per id |
| element_id | text null | `submit-entry-btn` | From a `data-track` attribute; only set for clicks |
| element_text | text null | `Add entry` | Human-readable label for the dashboard; no free-text field values |
| session_id | text | `s_9f3a...` | Opaque per-session id (cookie or memory), rotates; not a user id |
| actor_hash | text null | `u_7c21...` | Pseudonymized user ref (section 9); null when anonymous mode |
| ts | timestamptz | 2026-07-22T02:10Z | When |
| viewport_w / viewport_h | int | 1440 / 900 | Device context; needed to interpret heatmap coords |
| click_x_norm / click_y_norm | real null | 0.62 / 0.18 | Click position as fraction of viewport (0-1), resilient to screen size; clicks only |
| referrer_path | text null | `/initiatives` | In-app navigation flow |

Explicitly excluded columns: no raw IP, no user-agent string stored verbatim, no form values, no keystrokes, no mouse-move trails. Event context best practice (page URL, referrer, viewport, timestamp) is standard (source §13.3); we take the minimum that answers the 4 questions and nothing more.

---

## 6. Tracking: collection and storage design

Client path, following standard clickstream architecture (source §13.3, §13.4):

1. **Emitter hook** (`useUsageTracking`): a page-view event on route change (`usePathname`), and one delegated document click listener that fires only for elements carrying `data-track="..."`. Opt-in per element keeps noise and privacy risk down versus tracking every click.
2. **Batch in memory**, flush via `navigator.sendBeacon` on a short interval, on `visibilitychange`, and on `pagehide`. `sendBeacon` is non-blocking and survives page unload (source §13.5), which `fetch` does not reliably do on exit.
3. **Ingest route** `POST /api/events`: accepts a batch, validates with Zod (reuse the validation pattern already in `src/validation/`), drops anything malformed, writes rows. No auth beyond the existing session cookie; rate-limit per session with the existing `src/lib/rate-limit.ts`.
4. **Storage**: the `usage_events` table above, append-only, indexed on `(route_pattern)`, `(ts)`, and `(element_id)`. Roll up nightly into a small `usage_daily` aggregate so dashboards don't scan raw rows forever, and so raw rows can be dropped on the retention schedule (section 9).

Build note: this pipeline is small and specific. It is the part worth building ourselves (section 11).

---

## 7. Tracking: aggregation and the 4 core questions

All four are direct SQL over `usage_events` (or `usage_daily`), rendered with the already-installed recharts.

1. **Which pages are accessed most** — `COUNT(*) GROUP BY route_pattern WHERE event_type='page_view'`, ranked. `route_pattern` (not raw `path`) prevents `/initiatives/1` and `/initiatives/2` from splitting the count.
2. **How often I access a page** — same, filtered `WHERE actor_hash = <me>`. This question only works if identity is pseudonymized rather than fully anonymous (decision 2).
3. **Which buttons are clicked most** — `COUNT(*) GROUP BY element_id, element_text WHERE event_type='click'`, ranked. Depends on `data-track` attributes being present on the buttons that matter.
4. **Trends over time** — time-bucketed counts from `usage_daily` (day/week), any of the above sliced by `ts`. recharts line/area.

---

## 8. Heatmap: capture and rendering

Capture: on a tracked click, store `click_x_norm = offsetX / viewport_w` and `click_y_norm = offsetY / viewport_h` (0-1), plus the element id. Normalized coordinates survive different screen sizes; an element id/xpath gives a stable anchor when layout shifts (source §13.6). Store viewport dimensions (section 5) so a heatmap can be rendered per breakpoint band rather than smearing phone and desktop clicks together.

Render: overlay a canvas heatmap on a screenshot or the live page. `heatmap.js` is the standard open-source canvas heatmap renderer, with configurable radius, gradient, and opacity, driven by a datapoint store (source §13.6, §13.7). [A] `heatmap.js` is lightly maintained; confirm activity before adopting, else a ~100-line canvas gradient overlay is a viable fallback.

**Building the heatmap renderer from scratch is a poor trade** (the "pressure valve" in this plan). Use `heatmap.js` for rendering; keep only the capture (normalized coords) in our own pipeline. And be honest about ROI: on a 6-page internal tool with mostly-read viewers, click heatmaps are a nice-to-have, not a core question. This is why heatmap sits in Phase 2, after the 4 questions are answered.

---

## 9. Privacy and performance guardrails

These are employees, so the risk is surveillance, not marketing analytics. GDPR-style guidance for workplace analytics is consistent: minimize, aggregate, pseudonymize, retain briefly, and tell people first (sources §13.8, §13.9, §13.10).

Do NOT track: keystrokes, form field values, free-text content, continuous mouse-movement or scroll trails, or anything that reconstructs what an individual wrote. Clicks only, on opt-in `data-track` elements.

Identity: pseudonymize the user reference (`actor_hash` = keyed hash of user id with a rotating salt), or run fully anonymous (session-only, no `actor_hash`). Fully anonymous kills question 2 ("how often do I access") for everyone; pseudonymized keeps it but must never surface per-named-employee dashboards to other users. A pseudonymization step between source and analytics is the recommended pattern (source §13.10). Decision 2 picks the mode.

Retention: raw `usage_events` kept short (propose 90 days), aggregates (`usage_daily`) kept longer since they carry no individual detail. Retain only as long as the stated purpose needs (source §13.8).

Transparency: a short written notice to employees before tracking starts (controller, purpose, what is and isn't captured, retention), plus a lightweight DPIA. This is a requirement, not a nicety, for employee monitoring (sources §13.8, §13.9).

Performance: `usage_events` is append-only and write-heavy; batch inserts, index only what section 6 lists, and never let dashboards scan raw rows past the aggregate window. The graph edge table is tiny by comparison; cap traversal depth at 2 hops in Phase 1.

---

## 10. Recommended phased roadmap

**Phase 1 — explicit graph + core tracking (ship tracking with or before the graph).**
Scope: `initiative_links` table; activate `replicatedFrom` and derive `co_tag` edges; backlinks list + ego graph on the detail page; `/graph` explorer with react-force-graph; `usage_events` table + `/api/events` ingest + `useUsageTracking` (page views + `data-track` clicks); the 4-question dashboard in recharts; privacy notice + retention job. Rough effort: [A] the larger of the two features; graph data + UI is the bulk.
Sequencing rule: land tracking instrumentation early so the graph feature's own adoption is measurable from day one.

**Phase 2 — heatmap + AI-derived relations.**
Scope: normalized click-coord capture (already in the schema) + `heatmap.js` rendering behind an admin view; `pgvector` + embeddings + top-k suggestions with the human-confirm flow reusing the `duplicates.ts` pattern. Rough effort: [A] medium; embeddings are cheap, the confirm UI is the work.

**Phase 3 — scale-outs only if needed.**
If tracking scope grows to funnels, session replay, or feature flags, adopt self-hosted PostHog instead of extending the home-built pipeline (section 11). If the global graph crosses ~10k visible nodes, move the explorer to Sigma/WebGL. Neither is expected within the planning horizon.

---

## 11. Build vs off-the-shelf verdict per component

| Component | Verdict | Why |
|---|---|---|
| Graph edge storage | **Build** (Postgres table) | Trivial in the DB we run; a graph DB earns nothing at our scale (§2) |
| Graph traversal queries | **Build** | Recursive CTEs; small surface |
| Graph visualization | **Off-the-shelf lib** (react-force-graph) | Do not hand-roll a force simulation, zoom, drag |
| Event pipeline (page views + clicks) | **Build** | Small, tailored to the 4 questions, keeps employee data in our infra, mirrors the `score_events` ledger we already have |
| Heatmap rendering | **Off-the-shelf** (heatmap.js) | Building a canvas gradient renderer is a poor trade (§8) |
| Session replay | **Do not build; buy if needed** | Replay is a large, sensitive system; self-host PostHog only if scope demands it |
| Whole analytics suite (alternative to building) | **Consider self-hosted PostHog** as the "buy everything" path | PostHog bundles analytics + heatmaps + replay + flags (source §13.11). It wins if scope grows to funnels/replay. Building the narrow pipeline wins now: 4 specific questions, tight employee-privacy control, no new service. Lighter options (Umami) are page-analytics only and would not answer the button-click question well (source §13.11) |

The honest headline: build the narrow event pipeline and the graph; rent the two hard-to-build, low-differentiation renderers (heatmap, and replay if it ever comes up). If tracking ambitions expand beyond the 4 questions, stop building and self-host PostHog.

---

## 12. Open questions for me and the engineers

| # | Question | Owner |
|---|---|---|
| Q1 | Confirm expected initiative (node) count at 12 and 24 months. Changes the viz library ceiling. | Levi |
| Q2 | Which buttons/actions are worth `data-track` attributes? Tracking is opt-in per element. | Levi + eng |
| Q3 | Is there an existing ParagonCorp employee-monitoring / data-privacy policy this must fit? Sets retention and the notice. | Levi + IT/HR |
| Q4 | Where does the app deploy (Vercel + Neon vs internal)? Affects `pgvector`/AGE availability and the retention cron. | Eng + IT |
| Q5 | Who owns the privacy notice + DPIA sign-off before tracking ships? | Levi + IT/HR |
| Q6 | Should the graph explorer be viewer-visible or admin-only in Phase 1? | Levi |

---

## The 5 decisions I need from you before a PRD

1. **Graph edge scope for Phase 1.** Explicit user-created links only, or also auto-derive `co_tag` edges from existing tags and activate `replicated_from`? My recommendation: all three, since tags and the self-FK are already in the schema and unused. (Ties to §2.)

2. **Tracking identity mode.** Pseudonymized per-user (`actor_hash`, keeps "how often do I access a page") or fully anonymous (session-only, kills that one question, lowest privacy risk)? My recommendation: pseudonymized, with a hard rule that no per-named-employee view is ever shown to others. (Ties to §5, §9.)

3. **Build the narrow pipeline vs adopt self-hosted PostHog now.** My recommendation: build for Phase 1 (4 questions, employee-privacy control, no new service); revisit PostHog only if scope grows to funnels/replay. (Ties to §11.)

4. **Heatmap timing.** Phase 1 or Phase 2? My recommendation: Phase 2, and honestly question its ROI on a 6-page mostly-read internal tool before building it at all. (Ties to §8, §10.)

5. **AI-derived relations commitment.** Reserve for Phase 2 with `pgvector` now (schema already leaves room), or defer entirely? My recommendation: reserve for Phase 2; it shares vectors with the V2 LLM roadmap and reuses the existing human-confirm dedup pattern. (Ties to §4.)

---

## 13. Sources

1. Graph DB vs Postgres at scale: [PuppyGraph — Knowledge Graph vs Graph Database](https://www.puppygraph.com/blog/knowledge-graph-vs-graph-database); [Postgres as a graph database (HN)](https://brianlovin.com/hn/35386948); [Microsoft — PostgreSQL as your Graph Database](https://techcommunity.microsoft.com/blog/adforpostgresql/postgresql-as-your-graph-database-in-the-ai-era/4516323); [Cognee — Graph Databases Explained](https://www.cognee.ai/blog/fundamentals/graph-databases-explained).
2. Graph viz libraries: [PkgPulse — Cytoscape vs vis-network vs Sigma 2026](https://www.pkgpulse.com/guides/cytoscape-vs-vis-network-vs-sigma-graph-visualization-2026); [Medium — best libraries for large network graphs](https://weber-stephen.medium.com/the-best-libraries-and-methods-to-render-large-network-graphs-on-the-web-d122ece2f4dc); [Cambridge Intelligence — React graph visualization guide](https://cambridge-intelligence.com/blog/react-graph-visualization-library/).
3. Event schema / context: [growth-onomics — JavaScript tracking for clickstream](https://growth-onomics.com/javascript-tracking-for-clickstream-data-basics/); [Contentful — interaction tracking in web SDKs](https://www.contentful.com/developers/docs/personalization/optimization-sdk/interaction-tracking-in-web-sdks/).
4. Frontend logging/analytics design: [DEV — Frontend System Design: Logging, Analytics](https://dev.to/zeeshanali0704/frontend-system-design-logging-analytics-feature-flags-37g5).
5. sendBeacon batching: [OpenReplay — Sending background data with the Beacon API](https://blog.openreplay.com/sending-background-data-beacon-api/).
6. Heatmap capture/coords: [DEV — Integrating Heatmap.js with click](https://dev.to/idrisrampurawala/integrating-heatmap-js-with-mouse-over-click-in-angular-56ga); [heatmap.js](https://www.patrick-wied.at/static/heatmapjs/).
7. heatmap.js repo: [github.com/pa7/heatmap.js](https://github.com/pa7/heatmap.js).
8. Workplace analytics + retention: [Worklytics — GDPR-compliant productivity framework](https://www.worklytics.co/resources/track-productivity-without-employee-surveillance-gdpr-compliant-framework-2025).
9. GDPR employee monitoring checklist: [gstride — GDPR-compliant employee monitoring](https://gstride.ai/blog/gdpr-compliant-employee-monitoring/).
10. Pseudonymization pattern: [ICO — pseudonymising employee data case study](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/anonymisation/case-studies-on-pseudonymisation-and-anonymisation-techniques/case-study-pseudonymising-employee-data-for-recruitment-analytics/); [Worklytics — analytics without storing PII](https://www.worklytics.co/resources/gdpr-compliant-ai-usage-analytics-without-storing-pii).
11. Self-hosted analytics comparison: [Swetrix — 12 best open-source analytics 2025](https://swetrix.com/blog/open-source-website-analytics); [OpenPanel — self-hosted web analytics](https://openpanel.dev/articles/self-hosted-web-analytics); [SaaSHub — PostHog vs Matomo](https://www.saashub.com/compare-posthog-vs-matomo).
