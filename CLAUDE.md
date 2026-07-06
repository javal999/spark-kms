# SPARK Knowledge Management System

Project: internal web app replacing the SPARK WEEKLY UPDATE spreadsheet. Initiative knowledge base + 4-stream point system + Region × Segment area leaderboard.

## Read these first, in order

1. `KMS-Requirements-Doc-v1.1.md` — the approved requirements. Source of truth for WHAT to build. All decisions (D1-D8) are resolved; do not reopen them.
2. `KMS-Tech-Architecture-Task-Breakdown.md` — stack, schema, API surface, and the phased task list. Source of truth for HOW to build it.
3. `KMS-Upload-Template.xlsx` — reference output for the template generator (phase 3).
4. `SPARK WEEKLY UPDATE.numbers` — the real historical file. Use only to build the golden test fixture (task 2.3). Never import it into production.

## Working rules

- Execute the task breakdown in order. Do not start a phase before the previous phase's test gate passes.
- If the requirements doc and the architecture doc disagree, the requirements doc wins; stop and ask Levi.
- Scoring rules are the highest-risk area. Test-first: write the failing test from requirements section 5 before implementing.
- All date/week logic: Asia/Jakarta, Monday-based weeks, server-side only.
- `src/services/scoring.ts` is the ONLY module allowed to write score_events.
- Never store score totals; every displayed score is a SUM over score_events.
- App code lives in `spark-kms/` inside this folder. Keep the .md docs and template at the root untouched.

## Definition of done per phase

The gate tests listed at the end of each phase in the task breakdown, all green, plus a short note to Levi: what shipped, what's next, any requirement ambiguity found.
