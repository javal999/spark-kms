# SPARK Knowledge Management System

Project: internal web app replacing the SPARK WEEKLY UPDATE spreadsheet. Initiative knowledge base + 2-stream point system (Best Practice, Best Presenter) + Region × Segment area leaderboard. Live in production; the build phases are done, so most work now is a change to a running system.

## Read these first, in order

1. `KMS-Requirements-Doc-v1.1.md` — the approved requirements. Source of truth for WHAT to build: the scoring rulebook (§5), enums (§4.1), pages (§6), upload (§7), and the decision log D1–D22. The filename still says v1.1; the content is v1.2 plus the post-v1.2 decisions.
2. `KMS-v1.2-Epic-and-Plan.md` — the v1.2 scoring reshape (4 streams → 2, CEE to a pillar, auto-awards) and its workstream gates.
3. `KMS-Tech-Architecture-Task-Breakdown.md` — stack, schema, API surface, and the phase 1–5 task list. Source of truth for HOW it was built.
4. `spark-kms/docs/` — everything built after v1.2, each with its own spec: knowledge graph, usage tracking, AI-suggested links, SSO, and the August change batch (`prompt-5-changes.md`).
5. `KMS-Upload-Template.xlsx` — reference output for the template generator.
6. `SPARK WEEKLY UPDATE.numbers` — the real historical file. Use only to build the golden test fixture (task 2.3). Never import it into production.

## Working rules

- If two documents disagree, `KMS-Requirements-Doc-v1.1.md` wins; stop and ask Levi rather than shipping the other reading.
- Scoring rules are the highest-risk area. Test-first: write the failing test from requirements section 5 before implementing.
- **A change to scoring or an enum updates the requirements doc in the same commit** — the rulebook table, section 4.1, and a new D-number in the decision log. Code-only scoring changes are how the spec silently went wrong about point values in July–August 2026.
- All date/week logic: Asia/Jakarta, Monday-based weeks, server-side only. `spark-kms/src/services/week.ts` owns it; client components receive a date as a prop.
- `src/services/scoring.ts` is the ONLY module allowed to write score_events.
- Never store score totals; every displayed score is a SUM over score_events.
- Live-data migrations go through the ledger, are idempotent, and get a row in `spark-kms/MIGRATIONS.md` with the snapshot taken beforehand.
- App code lives in `spark-kms/`. The root .md docs are the specs: change them only to record a decision, never to restate what the code does.
- Confirm with Levi before any push or deploy.

## Definition of done

All four gates green (`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`), the requirements doc matching the shipped behavior, plus a short note to Levi: what shipped, what's next, any requirement ambiguity found. After a deploy, "it works" needs the user's path exercised on the live site — for a redirect, `curl -s -o /dev/null -D - https://kms.paracorplabs.com/<route>` and read `Location` — not only the component that changed.
