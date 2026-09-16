# Ops: usage rollup + retention (scheduling)

The usage dashboard's "Top pages" and "Trend" read from `usage_daily`, populated
by a nightly rollup; raw `usage_events` are purged after 90 days. Both run via
one endpoint, meant to be hit by a scheduler once a day (Phase 7, open question
O4 — resolved as an app endpoint, not pg_cron, so it works on Lightsail).

## Endpoint

```
POST https://kms.paracorplabs.com/api/cron/retention
Authorization: Bearer <CRON_SECRET>
```

Returns `{ "ok": true, "purged": <n> }`. Idempotent — safe to run repeatedly.

## Setup (one-time)

1. Pick a strong random secret and set **`CRON_SECRET`** in the Lightsail
   deployment env (same place as `DATABASE_URL` / `OPENROUTER_API_KEY`). Without
   it the endpoint fails closed (401).
2. Schedule a daily POST to the endpoint with that bearer token. Any of:

   **GitLab scheduled pipeline** (you already use GitLab) — add a job and set a
   pipeline schedule (CI/CD → Schedules) to daily, e.g. 20:00 UTC:
   ```yaml
   usage-retention:
     rules: [{ if: '$CI_PIPELINE_SOURCE == "schedule"' }]
     script:
       - curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET"
           https://kms.paracorplabs.com/api/cron/retention
   ```
   (Add `CRON_SECRET` as a masked CI/CD variable.)

   **A machine cron** (any always-on box):
   ```
   0 3 * * *  curl -fsS -X POST -H "Authorization: Bearer <secret>" https://kms.paracorplabs.com/api/cron/retention
   ```

   **AWS EventBridge Scheduler** → a Lambda/API destination hitting the URL with
   the header.

## Notes

- Until the schedule runs, "Your page views" on the dashboard still updates live
  (it reads raw events); only "Top pages"/"Trend" wait for the rollup.
- Rollup is a full recompute per day-bucket, so a missed night self-heals on the
  next run.

## Exactly what gets deleted

The purge deletes **whole Asia/Jakarta calendar days** that are more than 90
days before today — never part of a day. So no event is deleted before it is 90
days old, and each is deleted within a day after (on the next nightly run).

Whole days are required, not a stylistic choice. The rollup recomputes each day
from the raw rows present and overwrites that day's count. A purge cutoff of
`now − 90 days` lands mid-day; the next rollup would rebuild that day from its
surviving half and permanently undercount it. Fixed 2026-09-16, before any event
was old enough for it to happen (tracking began no earlier than 2026-07-22), and
guarded by `tests/integration/usage-retention.test.ts`.

## When the scheduled job fails

The job fails red and its log says why (`curl --fail-with-body` keeps the
response):

| Job log | Meaning | Fix |
|---|---|---|
| `CRON_SECRET is not set` | The variable is missing, or it is **protected** and the schedule's branch is not protected | Add it, or protect `main`, or untick "Protect variable" |
| `returned error: 401` + `{"error":"Unauthorized"}` | The GitLab value does not match the deployment's `CRON_SECRET` | Copy the deployment's current value into the GitLab variable. It was rotated on 2026-09-11 (deployment 33) |
| `returned error: 500` + `{"traceId":"err_…"}` | The rollup or purge threw | Look the trace id up in `/admin` → error log (super-only) |
| `curl: (28)` | Timed out after 120 s | Check the error log and container log; raise `--max-time` and `maxDuration` together |
| No scheduled pipelines, or stuck `pending` | Schedule inactive, its owner lost access, or no runner | Build → Pipeline schedules: check it is active and owned by a current maintainer |

The 500 row needs the route's error capture, which ships in the first deployment
after 2026-09-16; before it, a 500 left nothing in the error log.
