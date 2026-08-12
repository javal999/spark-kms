# Prompt: Implement and verify 5 SPARK KMS changes

**How to use:** Paste into a Claude Code session at the repo root (`spark_kb/spark-kms`). No slots to fill; all decisions are resolved below.
**Structure:** engineering-spec shape (Context / Rules / Tasks with acceptance criteria / Verification / Report).

---

CONTEXT

You are working in the SPARK KMS repo (`spark_kb/spark-kms`): a Next.js 16 App Router app, Postgres + Drizzle ORM, iron-session + M365 SSO auth, event-sourced scoring, deployed on AWS Lightsail. Read `CLAUDE.md`, `KMS-Requirements-Doc-v1.1.md`, and `KMS-Tech-Architecture-Task-Breakdown.md` before changing scoring or schema. Deliver 5 scoped changes. Each change is done only when its acceptance criteria pass and its tests are green.

RULES (hold all of these)

1. `src/services/scoring.ts` is the only module that may write `score_events`. Never store score totals; every displayed score is a live SUM. Corrections append a reversal event, never a DELETE.
2. For any scoring change, write the failing test from the requirements first, then implement. Put date and week logic in Asia/Jakarta, Monday-based, server-side only.
3. Region and Segment are Postgres enums. Adding a value requires a Drizzle migration plus updates to validation, the upload template, the submit form, and bulk-upload allowed values. Keep migrations additive.
4. Match existing patterns: guards (`requireAdmin` / `requireSuper`) re-check the live DB role; feature flags live in `src/lib/flags.ts`; the nav is `components/nav.tsx`.
5. Do not weaken privacy defaults. Current usage tracking is pseudonymous (`actorHash`), flag-gated (`tracking`), and purged after 90 days. Item 5 stays aggregate and pseudonymous; do not introduce named per-user analytics in this batch.
6. Report every scoring discrepancy you find in Task 1, including ones outside the stated expectation. Do not filter or suppress findings; order them by severity and let the reader decide.

TASKS

Task 1. Verify bulk-upload scoring (test-first).
Expected rule to assert: after a bulk upload, a row that qualifies for Best Practice awards +2 to the Best Practice stream, and a row flagged as Presenter awards +1 to the Presenter stream. The Presenter signal is a Presenter flag column in the bulk-upload template. If that column does not exist yet, add it to the template generator and the row parser, then award +1 Presenter for flagged rows through `scoring.ts`.
Do: write integration tests against the golden fixture that upload a batch and assert the per-stream SUM equals the expected points; if actual behavior differs, report it, then fix `scoring.ts` (and only `scoring.ts`) so the rule holds. Include the "New initiative = +1, first entry folds in" interaction so a new row that is also Best Practice is not double counted.
Acceptance: tests exist and pass; a short table shows expected vs actual points per stream for at least one new row, one Best Practice row, and one Presenter row.

Task 2. Let admins archive initiatives.
Do: extend the existing super-only soft-archive so the `admin` role can archive and restore. Reuse the archive service and route; lower the guard on those paths from `requireSuper` to `requireAdmin`. Do not add hard delete. The score ledger stays untouched (archive is read-time exclusion, fully reversible).
Acceptance: an admin (not only super) can archive and restore in the UI and API; guards enforce `admin` as the minimum; a test covers one admin success and one viewer denial; an archived initiative disappears from every read surface and Restore brings it back.

Task 3. Add Region "Sulawesi".
Do: add `Sulawesi` to `regionEnum` via an additive migration, then thread it through validation, the upload template generator, the submit form Region dropdown, and bulk-upload allowed values. Confirm no leaderboard or area query hardcodes the region list.
Acceptance: a new initiative and a bulk-upload row can both select Sulawesi and save; it appears as an area on the leaderboard; a test asserts Sulawesi is accepted by the validator and unknown region values still fail.

Task 4. Group Graph under Insights, super-admin only.
Do: in `components/nav.tsx`, present Graph within an Insights grouping, and raise Graph's `minRole` to `super` so only super-admins see it. Insights stays at `admin`. Keep both behind their existing flags (`graph`, `tracking`).
Acceptance: Graph and Insights read as one section in the sidebar; Graph is hidden from viewers and admins and visible to super-admins; a note states the final role and flag for each item.

Task 5. Interconnect Graph and Insights into platform-wide, aggregate usage visibility.
Scope: make Insights cover all users who access the platform, not a subset, at the aggregate level (counts, no names). Interconnect means a user with access can move from a Graph entity (initiative, person, tag) to its usage in Insights, and Insights shows platform-wide behavior (active users, page views, top entities) over a stated date window.
Do: extend `src/services/usage.ts` and the Insights page to report all-user aggregates keyed by the existing `actorHash`, not by name. Add at least one link from a Graph entity to its Insights view. Do not change the privacy notice or retention, since identifiability does not increase.
Acceptance: Insights shows aggregate all-user metrics with a date window; at least one link connects a Graph entity to its Insights view; the report states that analytics stayed pseudonymous and retention is unchanged.

VERIFICATION

Run the full test suite and report pass and fail counts. For each task, give one concrete piece of evidence: a test name plus result, a screenshot or the rendered nav, or a before-and-after metric. Do not claim a task is done without it. State any verification debt explicitly.

REPORT (produce at the end)

For each of the 5 tasks: what changed (files), the acceptance evidence, and any requirement ambiguity found. Then: migrations added, scoring or privacy posture changes, and a rollback note per task. List anything still blocked on a decision.
