# SPARK KMS — Backlog

Optional follow-ups. Nothing here is blocking — the app (Phases 1–5) is built,
tested, and live in production. These are "add when a real need shows up."

## Operations

- [ ] **Usage retention cron is not running yet.** `POST /api/cron/retention`
  (nightly rollup into `usage_daily` + 90-day purge of raw `usage_events`, see
  `docs/ops-usage-retention.md`) was set up but the scheduled job is still
  failing — Levi, 2026-08-24. Until it runs, the usage dashboard's "Top pages"
  and "Trend" stop advancing and old events are never purged; the live "Your page
  views" counter is unaffected. A missed night self-heals on the next run, so
  this is not urgent, but it should not stay broken. Debug in order:
  1. **Is `CRON_SECRET` on the deployment?** Without it the endpoint fails closed
     (401). Confirmed present on live deployment 31 (2026-08-24), so this is
     probably not the cause — but verify it survived any later redeploy.
  2. **Does a manual call work?** `curl -fsS -X POST -H "Authorization: Bearer
     <CRON_SECRET>" https://kms.paracorplabs.com/api/cron/retention` — expect
     `{"ok":true,"purged":<n>}`. A **401** means the bearer the scheduler sends
     doesn't match the deployment's `CRON_SECRET`. A **5xx** means the rollup
     itself is erroring — check the `/admin` error log (super-only since D30).
  3. **If the manual call works, the fault is the schedule, not the app.** In
     GitLab → CI/CD → Schedules, confirm the schedule exists and is active, and
     that `CRON_SECRET` is a **masked CI/CD variable** holding the same value the
     deployment uses. The most common failure: the pipeline job references an
     unset `$CRON_SECRET`, sends an empty bearer, and gets a 401 — so the job
     "runs" but purges nothing. Check the schedule's last pipeline for the curl
     job's exit code and output.

## Integration API & MCP (Phase 5) — hardening

- [ ] **Per-key audit granularity.** API writes are attributed to the key's
  *owner user* (`created_by`), not the specific key. Add an `api_key_id` column
  on `entries`/`initiatives` (or a small audit log) if you ever need to trace a
  row back to the exact key. *Matters once several write keys exist.*

- [ ] **API-key expiry / rotation.** Keys live until manually revoked (revoke is
  instant). Add an optional `expires_at` + a rotation reminder for governance.

- [ ] **Distributed rate limiting.** The 60 req/min limiter and key-lookup cache
  are in-memory (per container) — correct at the current `scale=1`. Move to
  Redis/Upstash *before* scaling the container past 1 instance, or the limit
  becomes per-instance. **First thing to pick up if you scale.**

- [ ] **API usage metrics.** Today you get `last_used_at` per key. Add per-key /
  per-endpoint call counts if you want visibility into how heavily partner teams
  query.

## Test quality

- [ ] **Mutation testing.** 287 tests pass, but the mutation gate
  (`stryker`) isn't set up. Add it to formally confirm the tests would catch
  regressions on critical paths (scoring, auth, API writes). *Passing tests
  prove the assertions hold, not that they would catch a regression — this is
  the largest remaining unknown about test quality.*

## Product / V2 roadmap (from earlier notes)

- [ ] Wrong-merge / detach UI (REQ-D4 — the `reverse*` scoring primitives already
  exist to support it).
- [ ] Semantic dedup, natural-language search, weekly digests, adopt-idea flow,
  attachments.
