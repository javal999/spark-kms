# Prompt: SPARK KMS change batch 6 (Top Initiatives filter, Initiatives table fit, bilingual guide, docs)

**How to use:** Paste into a Claude Code session at the repo root (`spark_kb`). No slots to fill; all decisions are resolved below.
**Structure:** spec-block shape (Context / Objective / Changes with acceptance criteria / Constraints / Results). Ran 2026-08-24.

---

CONTEXT

SPARK KMS is live. This batch touches three screens and the documents that describe them. The four files at the centre of it: `app/(app)/page.tsx` (dashboard), `components/week-selector.tsx` (shared with both leaderboards), `app/(app)/initiatives/page.tsx` (the list), and `app/(app)/guide/page.tsx` (`/guide`, added under D26, whose defining property is that it reads its values from the modules that own them rather than retyping them).

OBJECTIVE

Land the 4 changes below, then record them in the requirements document.

CHANGE 1: Top Initiatives period filter
Rename the dashboard section from "Weekly Top Initiatives" to "Top Initiatives". Replace the single week picker with a 2-level control: level 1 picks Weekly / Monthly / All-time, level 2 picks the week (8 most recent) or the month (6 most recent calendar months), and is absent for All-time rather than disabled. URL-driven and server-read. Default stays the current week. Pre-existing `?topweek=` links still resolve. Build a new component; leave both leaderboards on `WeekSelector`. Month arithmetic goes in `src/services/week.ts`.

CHANGE 2: Initiatives table fits without horizontal scroll
At 1280 by 800, Stage, Done and Flags are fully visible and the page does not scroll sideways. Constrain the Title column to one truncated line with the full title on hover. Do not delete or re-flow a column.

CHANGE 3: /guide in Indonesian, behind an English and Indonesian toggle
English stays the default. Prose moves to a bilingual copy module with both languages on every key and a test asserting parity. Every value read from the code renders identically in both languages. Enum values, field names and stream labels stay English inside the Indonesian copy. `/guide` only; no internationalisation library.

CHANGE 4: Documentation
Requirements document section 6 (Pages 1, 4 and 7) plus new decision-log rows. Record the batch here. No `MIGRATIONS.md` row, because the batch writes no data.

CONSTRAINTS

- No new runtime dependency. No database migration, no data write, no push, no deploy.
- Tests first, and no assertion loosened to make a failing implementation pass.
- Smallest change that meets the stated criteria: no abstraction with one caller, no refactor outside the 4 changes.

RESULTS

The 4 gates from `CLAUDE.md` (`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`), a measured scroll-width check for change 2, and a change note.

---

OUTCOME (2026-08-24)

Shipped as specified, recorded as **D27** (period filter and the rename), **D28** (table fit) and **D29** (bilingual guide).

New files: `src/lib/period.ts` (query-string to period, pure and unit-tested), `components/period-selector.tsx`, `src/content/guide-copy.ts`, `tests/unit/period.test.ts`.

Interface change: `topInitiatives()` takes a `Period` (`{kind: "week" | "month", key}`) instead of a week key; `undefined` still means all-time. `/api/top-initiatives` and `opTopInitiatives` stay week-keyed and convert at the call site, so no partner integration changed.

Two things found on the way, both pre-existing and both then fixed on Levi's instruction:

1. `components/week-selector.tsx` displayed the raw value ("all-time", "2026-W35") instead of its item label, because Base UI's `Select.Value` needs a format function. It now formats, so `/leaderboard` and `/leaderboard/area` read "All-time" and "24 Aug – 30 Aug 2026".
2. 9 of the 15 Playwright specs could not log in with `NEXT_PUBLIC_FEATURE_SSO=1`, because each spec carried its own copy of the login helpers and only `guide.spec.ts` knew to click past "Use a password instead". The helpers moved to one shared `tests/e2e/login.ts` that always reveals the form first. That exposed 2 specs asserting retired rules, which had been unrunnable since the flag went on:
   - `gate3` rejected an upload row for Region "Sulawesi", which **D22** made a real Region. The fixture now uses a region that is genuinely off-enum.
   - `gate4` tested the nomination-then-confirm flow that **v1.2 items 5-6** replaced with an immediate +2 auto-award. Rewritten to assert the auto-award (1 for the initiative per **D20**, plus 2 for the tick, so 3) and that the retired "Confirm +2" control is absent.

   All 15 e2e specs now pass.
