# Production migration log

One row per migration applied to the production database, newest last. A
migration that touches `score_events` also names the snapshot taken before it
and the result of the dry run, because that is the only evidence those gates
happened — the code alone cannot show it (REQ-S7, D16).

**Before applying anything to production:** take a Lightsail relational-database
snapshot, run the migration against a restored copy first if it touches score
data, then apply and fill in the row below in the same session.

| # | Migration | What it changes | Applied to prod | Snapshot taken before | Dry run | Data migration run with it |
|---|---|---|---|---|---|---|
| 0000 | `0000_large_ricochet` | Initial schema (phases 1–4) | not recorded | n/a — empty ledger | n/a | — |
| 0001 | `0001_api_keys` | API keys (phase 5) | not recorded | not recorded | n/a | — |
| 0002 | `0002_edit_log` | Admin edit log | not recorded | not recorded | n/a | — |
| 0003 | `0003_v12_people_bestpresenter` | v1.2: `person` table, `entries.best_presenter`, CEE pillar | not recorded | **not recorded** — required by REQ-S7/D16 | not recorded | `run-reverse-retired.ts` (reverses retired CEE/presenter events) |
| 0004–0011 | `0004_left_red_hulk` … `0011_blue_night_nurse` | Knowledge graph, usage tracking, AI links, SSO, archive | not recorded | not recorded | n/a | `run-reverse-first-entry.ts` ran in this window (2026-07-28, reverses the double-counted first entry) |
| 0012 | `0012_melted_monster_badoon` | `Sulawesi` region (D22) | not recorded | not recorded | n/a | — |
| — | *(no schema change)* | D23 stream reallocation | 2026-08-18 | `spark-kms-pre-d23-20260818-094748` | integration test `reallocate-streams.test` + local test DB (304 gates green); snapshot is the rollback | `run-reallocate-streams.ts` — **moved 84**, skipped 0 |
| — | *(no schema change)* | D25 Best Presenter removal | 2026-08-18 | `spark-kms-pre-d23-20260818-094748` (same batch) | integration test `remove-best-presenter.test` + local test DB | `run-reverse-best-presenter.ts` — **reversed 3** |
| 0013 | `0013_quiet_starjammers` | D32: pillar enum value `CEE` → `Core Excellence Execution` | 2026-09-11, with deployment 32 (`:spark-kms.app.28`) | `spark-kms-pre-d32-20260911-102021`, confirmed `available` at 10:25 WIB before any write | verified locally first (transaction-rollback trial on the test db, then applied to dev and test); on prod **84 initiatives before and after, 5 relabelled `CEE` → `Core Excellence Execution`**, and the enum lists no `CEE` | **none — and none is needed.** `ALTER TYPE ... RENAME VALUE` relabels the value in place, so every existing row moves with it atomically. There is no separate backfill to run and nothing to reconcile afterwards. |

### 2026-08-18 — D23 + D25 applied (image v25)

Snapshot `spark-kms-pre-d23-20260818-094748` taken and confirmed `available` before any write. New code (D23/D25) deployed first so new points land on Contribution, then the ledger scripts ran (reallocation, then Best Presenter reversal). Per-stream totals:

| Stream | Before | After |
|---|---|---|
| Best Practice (`best_practice`) | 128 | 44 (= 22 weekly awards × 2) |
| Contribution (`presenter`) | 3 | 84 (= 84 initiatives × 1) |

Live `best_presenter` points after reversal: **0**. Area totals unchanged (Total = both streams); only the split moved. `template_version` bumped to v1.3 in the same window. Both scripts append reversals through `scoring.reverse()` — no row deleted (REQ-S2).

### 2026-09-11 — D31 + D32 applied (image `app.28`, deployment 32)

Snapshot `spark-kms-pre-d32-20260911-102021` taken and confirmed `available` (10:25 WIB) before any write. Image `:spark-kms.app.28` (digest `sha256:d295d3bf…87fa`, built from `509ac71`) was preflighted locally — SSO button present, `NODE_OPTIONS=--max-old-space-size=768` baked in — and pushed *before* the migration, so old code ran against the renamed enum only for the time it took to create the deployment. The database was public for the migration alone (10:27–10:31) and closed before the deploy. New code confirmed serving on `kms.paracorplabs.com` via `/mcp-guide`.

| Pillar | Before | After |
|---|---|---|
| Activated New Touchpoint | 30 | 30 |
| Relevant Beauty Lifestyle | 28 | 28 |
| Personalized CRM | 21 | 21 |
| `CEE` → Core Excellence Execution | 5 | 5 |
| **Total** | **84** | **84** |

Rollback image: `:spark-kms.app.27` — but run it with deployment 33's environment, not by redeploying 31 (see the next entry). The rename itself reverses with one `ALTER TYPE ... RENAME VALUE`; the snapshot is the backstop.

### 2026-09-11 — deployment 33: Azure secret restored, exposed secrets rotated (no schema change)

Not a migration. Recorded here because it changes what a rollback can safely use.

- **SSO had been broken since deployment 31.** Its `AZURE_CLIENT_SECRET` was the literal placeholder `<the same value from your .env>`, set when deployment 31 was created on 2026-08-24, and deployment 32 copied it. Every Microsoft sign-in failed at the token exchange (`AADSTS7000215` in the `/admin` error log, seen from at least 2026-09-08). Deployment 33 carries the real value, checked against Microsoft's token endpoint before deploying.
- **`SESSION_SECRET`, `CRON_SECRET`, `OPENROUTER_API_KEY` and the DB master password were replaced** after the D32 deploy printed the live environment to a terminal. DB password changed 11:05–11:06 WIB; deployment 33 live at 11:09 WIB on `:spark-kms.app.28`. Everyone was logged out once by the new `SESSION_SECRET`.
- **Rollback: deployments 31 and 32 hold the retired DB password. Do not redeploy them as they are** — the app would lose its database. To run an older image, build from the live deployment and change only the image; the method under `LIGHTSAIL-DEPLOY.md` → Rollback already does this.

### 2026-09-11 — deployment 34: SSO redirects fixed (no schema or env change)

The first successful Microsoft sign-in on deployment 33 was redirected to `https://0.0.0.0:8080/`: in the standalone build a route handler's `req.url` carries the container's bind address, so every API redirect built from it pointed at the container (TRD-2026-009 E17). Deployment 34 (`:spark-kms.app.29`, digest `sha256:2e42a99e…3cfe`, built from `131bcd2`) sends relative redirects instead. Live from 14:08 WIB; verified on the public site — `/api/auth/logout` → `/login`, `/api/auth/sso/callback` → `/login?e=sso`. Environment copied unchanged from 33, so no logout and no database change. Rollback target: deployment 33 (same environment).

## Backfill gaps

Rows above say "not recorded" because the evidence was never written down, not
because the step was skipped — the deploy runbook
(`LIGHTSAIL-DEPLOY.md`) and the v1.2 plan both require the snapshot. Two rows
are worth reconstructing from the AWS console if the snapshots still exist:

- **0003** — the v1.2 migration, the only one that reversed live score events at
  scale. Snapshot id and date.
- **the 2026-07-28 first-entry reversal** — how many events it reversed
  (`run-reverse-first-entry` prints the count).

Everything from here forward gets filled in at apply time.

## Ledger-touching scripts

| Script | Purpose | Idempotent | Test |
|---|---|---|---|
| `src/db/run-reverse-retired.ts` | v1.2: reverse `presentation` / `cee_participation` / `cee_best` events (REQ-S5) | yes — skips already-reversed events | `tests/integration/migration-v12.test.ts` |
| `src/db/run-reverse-first-entry.ts` | D20: reverse the legacy first-entry +1 | yes | `tests/integration/reverse-first-entry.test.ts` |
| `src/db/run-reallocate-streams.ts` | D23/REQ-S8: move historical `new_initiative` and `entry` points to the Contribution stream | yes — a second run moves 0 | `tests/integration/reallocate-streams.test.ts` |
| `src/db/run-reverse-best-presenter.ts` | D25/REQ-S11: reverse every Best Presenter point so none is left on any initiative | yes — a second run reverses 0 | `tests/integration/remove-best-presenter.test.ts` |

**Run order when both D23 and D25 ship together:** reallocation first, then the Best Presenter reversal. Both are idempotent and order-independent in effect, but running them in this order keeps the counts in each script's output easy to reconcile against the leaderboard afterwards.

Both write compensating events through `scoring.reverse()`. Neither deletes a
row. Any future one must do the same.
