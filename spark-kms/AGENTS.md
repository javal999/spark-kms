<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# SPARK KMS — ground rules

This app replaces the SPARK WEEKLY UPDATE spreadsheet: an initiative knowledge
base, a 2-stream point system (Best Practice, Best Presenter), and a
Region × Segment leaderboard. Live in production.

The rules below hold for every change in this directory. They are repeated from
the root `CLAUDE.md` because a session started inside `spark-kms/` does not
always load it.

1. **`src/services/scoring.ts` is the only module that writes `score_events`.**
   Corrections append a `reversal` event; never DELETE or UPDATE a score row.
2. **Never store a score total.** Every displayed number is a live SUM over
   `score_events` (REQ-S1).
3. **Test-first for any scoring rule.** Write the failing test from the
   requirements, then implement.
4. **Date and week logic is Asia/Jakarta, Monday-based, server-side only.**
   `src/services/week.ts` owns it. A client component receives a date as a prop;
   it does not compute one. Guarded by `tests/unit/server-side-dates.test.ts`.
5. **A scoring or enum change updates the requirements doc in the same commit.**
   If you change `RULES` in `scoring.ts`, a point value, a cap, or a pg enum,
   edit `KMS-Requirements-Doc-v1.1.md` (rulebook §5, enums §4.1, and the decision
   table) in that same commit and give the decision a D-number. Three changes
   shipped without this in July–August 2026 and the doc silently went wrong
   about point values — that is the failure this rule exists to prevent.
6. **Enum values are additive Drizzle migrations**, threaded through
   `src/lib/enums.ts`, validation, the upload template, the submit form, and
   bulk-upload allowed values. `tests/unit/enums.test.ts` guards the copies.
7. **Live data migrations go through the ledger**, are idempotent, and are
   recorded in `MIGRATIONS.md` with the snapshot taken before them.
8. **Keep all four gates green:** `npm test`, `npx tsc --noEmit`,
   `npm run lint`, `npm run build`. If `tsc` reports duplicate identifiers in
   `.next/types`, look for Finder/iCloud copies (`routes.d 2.ts`) before
   believing it: `tsconfig.json` excludes `* ?.ts` for exactly that reason, so a
   real duplicate-identifier error now means a real one.
9. **Confirm with Levi before any push or deploy.** GitLab is the primary
   remote, GitHub the backup. Deploy per `LIGHTSAIL-DEPLOY.md`.

## Where the specs live

- `../KMS-Requirements-Doc-v1.1.md` — the rulebook and decision log (D1–D22).
  Source of truth for scoring, enums, pages, and upload. Note the filename says
  v1.1; the content is v1.2 plus post-v1.2 decisions.
- `../KMS-Tech-Architecture-Task-Breakdown.md` — stack and phases 1–5.
- `../KMS-v1.2-Epic-and-Plan.md` — the v1.2 workstreams and their gates.
- `docs/` — everything built after v1.2: knowledge graph, usage tracking,
  AI-suggested links, SSO, and the August change batch
  (`docs/prompt-5-changes.md`).
