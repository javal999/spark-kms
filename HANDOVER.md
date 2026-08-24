# SPARK KMS — handover

**For:** the HR & Commercial Team. TODO (Levi): name the individual once assigned, and note what they already know about SPARK.
**From:** Levi (Product Business Solutions Team). **Written:** 2026-08-19, last updated 2026-08-24 against commit `501e3c8`.

Read this before your first Claude Code session; return to section 5 whenever you are about to approve something.

---

## 1. What SPARK KMS is

SPARK KMS is the internal web app that replaced the *SPARK Weekly Update* spreadsheet. It is live at **https://kms.paracorplabs.com**, used by the marketing and sales teams. Three things live in it:

- **A knowledge base.** An *initiative* is a topic. Each collects *entries* — dated notes categorised **Best Practice** or **Unlocking** — plus action items and a stage (Idea, Pilot, Running, Ready to Scale).
- **A point system, 2 streams.** **Best Practice** holds one thing: the Best-Practice-of-the-Week award, +2, at most one per Area per week. **Contribution** holds everything else earned: +1 for a new initiative, +1 per entry per initiative per day.
- **A leaderboard of Areas.** An Area is a Region × Segment pair (6 × 4). Areas rank by points, weekly or all-time.

Every number on every screen is summed live from the `score_events` ledger. Nothing stores a total. That one choice is why a score can always be explained and corrected, and it is the thing most worth protecting.

## 2. Where the truth lives

**`KMS-Requirements-Doc-v1.1.md` outranks every other document here.** When two disagree it wins, and the disagreement gets fixed rather than worked around. (The filename says v1.1; the content is v1.2 plus D20–D30.)

| Path | What it decides | Open it when |
|---|---|---|
| `KMS-Requirements-Doc-v1.1.md` | Scoring rulebook (§5), enums (§4.1), pages (§6), upload (§7), decision log D1–D30 (§12) | Any question of what the system is supposed to do |
| `KMS-v1.2-Epic-and-Plan.md` | The v1.2 reshape (4 streams to 2, CEE to a pillar, auto-awards) and its gates | You need the history behind the current scoring shape |
| `KMS-Tech-Architecture-Task-Breakdown.md` | Stack, schema, API surface, build phases 1–5 | You need how it was built, not what it does |
| `spark-kms/docs/` | Everything built after v1.2, each with its own spec: knowledge graph, usage tracking, AI-suggested links, M365 SSO, error observability, the August change batch | Work touches one of those features |
| `CLAUDE.md` (root) and `spark-kms/AGENTS.md` | The working rules a Claude Code session loads by itself | Before changing how you work, not for product questions |
| `spark-kms/MIGRATIONS.md` | Every migration applied to the production database, with its snapshot | Before and after anything touching live data |
| `spark-kms/BACKLOG.md` | Optional follow-ups, nothing blocking | Deciding what to do next |
| `spark-kms/LIGHTSAIL-DEPLOY.md` | What runs in production and how to redeploy | Deploying or debugging production |
| `/guide` in the app ("How SPARK works") | The rulebook for the people who write into SPARK, rendered from the code | An admin asks how points work |

**Statements in this repo that are now wrong.** Do not repeat them; correct them when you next touch the file.

1. `README.md`: "event-sourced **4-stream** point system". There are 2, and the second is **Contribution** (D23).
2. `README.md` sends you to `spark-kms/README.md` to run the app. That file is untouched `create-next-app` boilerplate; the runbooks are `spark-kms/LIGHTSAIL-DEPLOY.md` and `DEPLOY.md`.
3. `CLAUDE.md` and `spark-kms/AGENTS.md` say the decision log is **D1–D22**, and both name the streams "Best Practice, Best Presenter". It runs to **D30**, and Best Presenter is gone (D25).
4. Requirements §10.2 has super-admins confirming BP-of-week and logging presenter/CEE points on Mondays. All three are gone: awards are automatic (D14), CEE is a pillar (D10), Best Presenter is retired (D25).
5. Requirements §7.3 lists a Best Presenter template column and "Region — 5 values". The column went at template v1.3 (D25); there are **6** regions since Sulawesi (D22).
6. Requirements §6 (Page 2) and §4.2 describe **two** weekly checkboxes. Only Best Practice of the Week remains.

## 3. The rules that must not break

**Only one file writes points.**
`spark-kms/src/services/scoring.ts` is the only module that writes `score_events`. A correction appends a `reversal`; no row is updated or deleted.
Why: one writer is why the caps, the streams and the audit trail hold.
What breaks: points no rule explains and no one can reverse.
Where: `spark-kms/src/services/scoring.ts`, REQ-S2.

**Scores are never stored, only summed.**
Every number on screen is a live SUM over `score_events`.
Why: a stored total drifts from the events behind it and nobody can tell which is right.
What breaks: a leaderboard that cannot be explained or corrected.
Where: `scoring.ts`, REQ-S1.

**A scoring or enum change updates the requirements doc in the same commit.**
Change a point value, a cap, a stream or an enum, and the same commit edits the rulebook (§5), the enum list (§4.1) and adds a numbered decision (§12).
Why: three changes shipped without it in July and August 2026 and the document went quietly wrong about point values.
What breaks: the written record stops matching the system.
Where: `CLAUDE.md`, decisions D20–D30.

**Scoring changes are written test-first.**
Write the failing test from the requirement, watch it fail, then implement.
Why: a scoring error stays invisible until a region disputes its rank.
What breaks: a rule that passes review and pays the wrong points.
Where: `spark-kms/tests/unit/`, `tests/integration/scoring.test.ts`.

**Dates are Asia/Jakarta, Monday weeks, server-side only.**
`src/services/week.ts` owns every date and week calculation. A client component is handed a date; it never computes one.
Why: a date computed in the browser uses the reader's timezone.
What breaks: weekly totals that differ per viewer.
Where: `spark-kms/src/services/week.ts`, guarded by `tests/unit/server-side-dates.test.ts`.

**A new enum value is an additive migration, threaded everywhere.**
Adding a region, segment or pillar means a Drizzle migration plus `src/lib/enums.ts`, validation, the upload template, the submit form and the bulk-upload allowed values.
Why: the list is copied into six places and a missed copy fails only at upload time.
What breaks: rows that reject on import with no obvious cause.
Where: `spark-kms/src/lib/enums.ts`, guarded by `tests/unit/enums.test.ts`. Sulawesi (D22) is the worked example.

**Live-data migrations go through the ledger, with a snapshot first.**
Snapshot the database, run the change as reversal-and-reissue through `scoring.ts`, make it idempotent so a second run moves nothing, then record it in `MIGRATIONS.md` the same session.
Why: the snapshot is the rollback and the row is the only evidence the gates happened.
What breaks: a live data change nobody can undo or prove.
Where: `spark-kms/MIGRATIONS.md`, REQ-S7, D16.

**The four gates stay green.**
`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, from `spark-kms/`. Today: 327 tests in 50 files, all passing.
Why: they are the entire safety net; there is no QA stage after you.
What breaks: nothing visible, until production.
Where: `spark-kms/AGENTS.md` rule 8.

**Levi runs every push, deploy and production database command.**
You build and test locally and push to GitHub. Anything that leaves your machine for GitLab, Lightsail or the production database is executed by Levi, who holds that access. When a change is ready, ask Claude for the exact commands as one copy-paste block and send it to Levi rather than describing what needs doing.
Why: the app is live, the database holds real regional scores, and Levi is the only holder of the AWS and GitLab credentials.
What breaks: an unreviewed change reaches 500 users, or a production command is run by someone who cannot roll it back.
Where: `CLAUDE.md`, and the split in section 7.

## 4. Running a Claude Code session here

**Claude reads the rules on its own.** A session at the repository root loads `CLAUDE.md`; one inside `spark-kms/` loads `AGENTS.md`, the same rules restated. **Start at the repository root by default** — only there do the specification documents sit next to the code, and anything touching scoring needs both.

**Name the rule your request lands against.** Claude is literal: it does the thing you named, not the adjacent thing you meant. Naming a requirement (`REQ-S1`) or a decision (`D23`) makes it read the right page first.

**Three requests, as you would type them:**

> Read requirements §5, then tell me where the +1 for a new initiative is implemented and which tests cover it. Change nothing yet.

> We need a new segment, "Pro Beauty". Follow the enum rule in AGENTS.md: list every file that has to change and the decision-log entry you would write, before touching any of them.

> An admin says their area's Best Practice score dropped. Explain it from the score_events ledger, and say whether a rule or a reversal caused it.

**When the request touches points, ask for three things in order:** the failing test from the requirement, the implementation, then the requirements-doc edit with its D-number. If the implementation comes first, ask for the test.

**Unsure a change is safe? Ask for the read-only version first** — "tell me what you would change and why, do not edit yet".

**Ask for Levi's commands as a block.** When work is done: "give me the exact commands Levi runs on his terminal to push and deploy this, in one block, with what each line does". Levi runs them; you never do.

## 5. What to check before approving

| Change type | Ask Claude to show you | A good answer looks like |
|---|---|---|
| Scoring or enum change | The failing test, the diff, and the requirements-doc edit in the same commit | A named requirement (REQ-S…), a new D-number, and `npm test` output with the new test passing |
| Database migration on live data | The snapshot taken, the dry run, the idempotency check, the `MIGRATIONS.md` row | A snapshot name confirmed `available` **before** any write, plus a count of rows moved and rows skipped |
| Handing a release to Levi | The command block for his terminal, what is in the release, which gates passed, the rollback | All four gates green, one copy-paste block, and the previous image tag named as the way back |
| Bulk upload of real data | The dry-run preview, the duplicate candidates, the row count | A preview that fails bad rows with reasons, and no commit before you have read them |
| Routine UI or copy change | The screenshot or the page it changed, and the gates | Gates green; no file under `src/services/` touched |

Two answers should stop you: a scoring change with no test, and a live-data change with no snapshot.

## 6. The weekly rhythm

**A week is Monday 00:00 to Sunday 23:59, Asia/Jakarta** (§4.3, `src/services/week.ts`). Points count on their `effective_date`, not on when they were typed, so a backdated entry lands in the right week and past weekly views recompute exactly.

- **Every week:** admins submit entries. Ticking "Best Practice of the Week" awards +2 immediately — the first ticked entry in an Area that week scores, later ones hit the cap. The dashboard defaults to the current week; the leaderboard toggles this week, previous weeks, all-time.
- **Every month:** fill one row in `spark-kms/docs/usage-snapshot.md` from `/insights` and `/leaderboard`, first working day, ten minutes. Usage data is purged after 90 days, so an unrecorded month is gone. Areas-scoring is the adoption number that matters.
- **Every month:** the §10.3 hygiene pass — initiatives with no entry in 60 days, unlockings with no action item.

The Monday forum still runs. Admins enter that week's material into SPARK themselves, so the app follows the forum rather than replacing it — if a week looks empty on the leaderboard, ask whether the forum happened before assuming a bug.

## 7. Runbook

All commands run from `spark-kms/`.

| Command | What it does | Run it when | A pass looks like |
|---|---|---|---|
| `npm test` | Unit and integration suite | Before every approval | `327 passed` today, and never fewer without an explanation |
| `npx tsc --noEmit` | Type check | Same | No output |
| `npm run lint` | ESLint | Same | No errors |
| `npm run build` | Production build | Before any deploy | Build completes |
| `npm run dev` | Local app on http://localhost:3000 | Trying a change by hand | Page loads after login |
| `npm run db:generate` | Writes a Drizzle migration from schema changes | Schema changed | A new file under the migrations folder |
| `npm run db:migrate` | Applies migrations to the database in `.env` | After generating, locally first | Migration names printed, no error |
| `npm run test:e2e` | Playwright journeys | Before a release that touches submit or roles | All specs pass |

**Production** (`LIGHTSAIL-DEPLOY.md` is the runbook — follow it rather than improvising): AWS Lightsail in `ap-southeast-1`, container service `spark-kms` at scale 1, PostgreSQL `spark-kms-db` with `pg_trgm` and 7-day backups, about $30 a month. A deploy builds an amd64 image, pushes it to the service registry, and creates a deployment. The `--build-arg NEXT_PUBLIC_FEATURE_*` flags in that build are not optional — they are compiled into the client bundle, and a deploy without them silently ships the app with SSO, the graph and tracking switched off. The runbook has carried them since 2026-08-24.

**Who runs what.** This is the whole handover in one table.

| Thing | Held by | How work gets done |
|---|---|---|
| Local development and testing | You | Clone from GitHub, run the four gates locally |
| GitHub `github` remote (https://github.com/javal999/spark-kms.git) | Shared with you | You push branches here |
| GitLab `origin` remote (paragon-is/pbs/kms-spark) | Levi | He pushes and reviews there |
| AWS Lightsail: deploys, database, snapshots | Levi | You send him the command block; he runs it |
| Route 53 / `kms.paracorplabs.com` | Levi | Unchanged |
| `OPENROUTER_API_KEY` and its cost | Levi | Unchanged |
| Super-admin accounts in the app | Unchanged from today | Ask Levi for an admin login of your own |

**Local setup:** copy `spark-kms/.env.example` to `.env` and point `DATABASE_URL` at your own local Postgres — never at production. `npm run db:migrate` builds the schema, `npm run db:seed` plants known dev logins (it refuses to run against production).

TODO (Levi): confirm the daily `POST /api/cron/retention` job is really scheduled and say where `CRON_SECRET` lives. `docs/ops-usage-retention.md` describes the setup but nothing records that it was done, and if it is not running, usage data stops rolling up and old events are never purged. Check GitLab CI/CD → Schedules.

## 8. State of play

**Shipped most recently:** a security fix — `GET /api/admin/errors` was readable by any admin and is now super-admin only (D30, 2026-08-24). `proxy.ts` does not cover `/api`, so a route's own guard is its whole perimeter; that is the general lesson, not just this route. Before it, the D27/D28/D29 UI batch — the dashboard's **Top Initiatives** two-level period filter (weekly / monthly / all-time), the Initiatives table fitting at 1280 px without horizontal scroll, and `/guide` in **English and Indonesian** behind a toggle. Before it, the `/guide` page itself (D26) and the D23/D24/D25 scoring batch. None of the three touched scoring or data.

**Last live-data changes**, both applied 2026-08-18 behind snapshot `spark-kms-pre-d23-20260818-094748`: the D23 reallocation moved **84** events to Contribution, and the D25 removal reversed **3**. Area totals were unchanged by the first, and dropped by the reversed awards on the second.

**Tests:** 368 passing in 52 files, verified 2026-08-24 at commit `501e3c8`. Phases 1–5 and the v1.2 batch are live; nothing in the backlog is blocking. The Playwright suite is 15 passing in 5 specs, also 2026-08-24: sign-in moved to one shared `tests/e2e/login.ts` that clicks past "Use a password instead", so the suite now runs with `NEXT_PUBLIC_FEATURE_SSO=1` instead of failing 9 of 15 at the login screen. Two specs that had been unrunnable behind that failure were asserting retired rules (pre-D22 Sulawesi, and the nomination-then-confirm flow v1.2 replaced with an auto-award) and were corrected to the current rulebook.

**The three risks worth knowing:**

1. **Spec drift.** The requirements doc has already gone wrong about point values once. That is why the same-commit rule exists and why section 2 lists six stale statements. Treat a stale doc as a defect.
2. **Test quality is unmeasured.** No mutation testing is set up (`BACKLOG.md`), so the tests prove their assertions hold, not that they would catch a regression. The largest unknown about the safety net.
3. **Rate limiting is per-container.** The 60-per-minute API limit and the key cache live in memory: correct at scale 1, wrong the moment a second instance exists. Fix it before scaling.

## 9. First week

1. Read this document, then requirements sections 1 to 5 and the decision log (§12).
2. Log into https://kms.paracorplabs.com and open `/guide` — the same rules in the admins' language, in English or Indonesian.
3. Click one initiative through to its points panel, then the leaderboard and an Area drill-down.
4. Ask Levi for a GitHub invite, an admin login, and the `.env` values you need locally.
5. Run all four gates from `spark-kms/` and confirm 368 tests pass locally.
6. Start a Claude Code session at the repository root, ask the first example request in section 4, and check the answer against section 1 here.
7. Fill the 2026-08 row of `docs/usage-snapshot.md` from `/insights`.
8. Fix the six stale statements in section 2, one commit, no behaviour change.
9. Take one small `BACKLOG.md` item through the full loop: test, change, gates, approval.
10. Send Levi one command block for a real change, however small, so the handoff is rehearsed before it matters.

## 10. Open items for Levi

Two left. Everything else was settled on 2026-08-19 and is recorded in section 7.

- The individual taking over inside the HR & Commercial Team, and what they already know about SPARK (top of this file).
- Whether the daily `/api/cron/retention` job is scheduled, and where `CRON_SECRET` lives (section 7).

## 11. Proposed edits to the agent files

Not applied — review, then make the change or ask Claude to. The first two replace an existing rule rather than adding one, so the rule count stays flat; both files already sit at the length where extra rules get dropped silently.

**`CLAUDE.md`** (root) — replace `- Confirm with Levi before any push or deploy.` with:

```
- Levi runs every push, deploy and production database command. Produce the
  exact commands as one copy-paste block for his terminal; do not run them.
```

**`spark-kms/AGENTS.md`** — replace rule 9 with:

```
9. **Levi runs every push, deploy and production database command.** Produce
   the exact commands as one copy-paste block for his terminal; do not run
   them. GitLab is the primary remote, GitHub the one the owner pushes to.
   Deploy per `LIGHTSAIL-DEPLOY.md`.
```

**`CLAUDE.md`** (root), as item 7 of the "Read these first, in order" list, after `SPARK WEEKLY UPDATE.numbers`:

```
7. `HANDOVER.md` — the owner's orientation guide: what the system is, which
   documents are stale, who runs what, and what to check before approving a
   change. Read it when the person you are working with is new to the project.
```

**`spark-kms/AGENTS.md`**, at the end of the "Where the specs live" list:

```
- `../HANDOVER.md` — the owner's orientation guide, including the list of
  statements in this repo that are out of date.
```
