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
