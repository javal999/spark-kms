---
doc_id: TRD-2026-008
doc_type: trd
project: spark-kms
systems: [spark-kms, lightsail-container, lightsail-postgres]
vendors: []
status: draft
owner: levi
engineer_signoff: null
last_verified: 2026-07-28
supersedes: null
related: [ops-usage-retention.md]
---

# TRD — Batch-upload error tracing (server observability)

## 1. Basics

| | |
|---|---|
| **Problem** | The team hits *"Couldn't import the file — something went wrong on the server"* during bulk upload, and we cannot trace it: there were **zero logs** in the upload path and unexpected errors were swallowed into a bare HTTP 500. |
| **Goal** | Capture every unexpected server error with enough context to diagnose it, give the user a reference code, and let an admin read the error in-app without server access. |
| **Owner** | Levi (PM) |
| **Engineer signoff** | _none yet — required before Approved_ |
| **Tier** | Lite (single system: the KMS app + its DB) |

## 2. Glossary

| Term | What it is |
|---|---|
| **Bulk upload commit** | `POST /api/upload/commit` — the all-or-nothing DB write step after preview. Where the reported 500 occurs. |
| **`UploadError`** | A *domain* error the service throws on purpose (bad rows, wrong template, duplicate file). Already mapped to a clean status + message. |
| **Unexpected error** | Anything else thrown during a request (DB constraint violation, scoring-write failure, transaction timeout). This is the class that was vanishing. |
| **traceId** | A short id (`err_ab12cd34ef56`) minted per captured error, shown to the user *and* stored, so a report maps to an exact log line + DB row. |
| **`error_events`** | New append-only Postgres table holding captured errors for the in-app viewer. |
| **Lightsail logs** | stdout of the container, viewable in the AWS console — where the structured JSON error line also lands. |

## 3. Root cause (why it was untraceable)  `[S: app/api/upload/commit/route.ts]`

The commit route's `catch` mapped `UploadError` to a clean response and **re-threw everything else** (`throw err`). Next.js turned that into a generic 500 with no body detail, and **nothing was written to any log**. The client ([upload-errors.ts](../src/lib/upload-errors.ts)) rendered the 500 as the generic message in the screenshot. Preview had already succeeded (27 rows, 0 errors), so the failure is at **DB-write time inside `commitUpload`'s transaction** — precisely the swallowed class. `[S: src/services/upload.ts]`

## 4. Design

### 4.1 What we capture, on every instrumented route
When an unexpected (non-`UploadError`) error is caught, `captureError(err, ctx)` `[S: src/lib/error-log.ts]`:
1. mints a `traceId`;
2. writes a **structured JSON line to stdout** → Lightsail logs (survives even if the DB is the thing that broke);
3. **best-effort inserts a row** into `error_events` for the in-app viewer;
4. returns the `traceId`; the route replies `500 { error, traceId }`.

The util **never throws** — logging must not mask the original failure. `[S: error-log.test.ts]`

### 4.2 Data contract — `error_events`  `[S: src/db/migrations/0007]`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `trace_id` | text, unique | the `err_…` shown to the user |
| `route` | text | e.g. `POST /api/upload/commit` |
| `actor_id` | integer, **nullable, no FK** | so an error still logs for a since-deleted user |
| `name` | text | error class (e.g. `PostgresError`) |
| `message` | text | error message |
| `stack` | text, nullable | stack trace |
| `meta` | jsonb, nullable | **bounded scalars only** (batch id, counts, file size) |
| `created_at` | timestamptz | indexed for recency |

**PII rule `[S: src/lib/error-log.ts docstring]`:** `meta` never carries request bodies, uploaded row content, or PICs — only triage scalars. Message/stack come from DB/runtime errors, which do not contain row content. We deliberately do **not** log request bodies.

### 4.3 Surfacing to people
- **User:** the upload error now appends ` (ref err_…)` so they can quote it. `[S: src/lib/upload-errors.ts]`
- **Admin:** Admin → **Error log** section renders the 50 most recent rows (time, trace, route, error, actor). Also `GET /api/admin/errors?limit=` (admin-gated). `[S: app/(app)/admin/page.tsx, app/api/admin/errors/route.ts]`

## 5. Scope

**Shipped in this change (upload first):** `error_events` table + migration 0007; `captureError`/`serverErrorResponse` util; instrumentation of `POST /api/upload/commit` and `/api/upload/preview`; traceId in the user message; in-app Error-log viewer + read API; unit tests (21 passing). **Not yet deployed** — awaiting Levi's go-ahead. `[S: repo]`

**Next (reuse across routes):** apply `captureError` to the remaining API routes' catch-alls (scoring, entries, admin ops, REST v1). Low effort — the util is route-agnostic. `[A]`

**Non-goals (this doc):** external APM/alerting (Sentry-style), client-side error capture, request tracing across services.

## 6. Failure modes

| If… | Then | Mitigation |
|---|---|---|
| DB is down (the error itself) | DB persist fails | stdout line still written; `captureError` swallows the persist failure `[S: error-log.test.ts]` |
| `error_events` grows unbounded | table bloat over time | **[OPEN]** add a purge (mirror the 90-day `usage_events` retention cron) |
| Two errors race the same traceId | unique index conflict | practically impossible (`randomUUID`); a conflict would just fail the one persist, not the request |

## 7. Open questions

- **[OPEN — retention: how long do we keep `error_events`? owner: Levi — needed before this bloats.]** Recommend folding a purge into the existing retention cron ([ops-usage-retention.md](ops-usage-retention.md)); 90 days matches usage data.
- **[OPEN — alerting: do we want to be notified on a spike, or is the in-app viewer enough for now? owner: Levi.]**
- **[OPEN — rollout order for §5 "Next": which routes matter most after upload? owner: Levi + engineer.]**

## 8. Rollback

Additive and low-risk. Code: revert the route `catch` blocks (behaviour returns to the prior generic 500). Schema: `DROP TABLE error_events;` — no other table references it (no inbound FK). No data migration, no backfill. `[S: migration 0007]`

## 9. What this gives you for the current bug

Once deployed, the next time the team hits the upload error they'll see a `ref err_…`. You open **Admin → Error log**, find that row, and read the real message + stack (e.g. *"null value in column X violates not-null constraint"* or *"deadlock detected"*) — the exact detail that is impossible to get today.
