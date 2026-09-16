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
     **Rotated on 2026-09-11 (deployment 33)** after the old value was exposed;
     the GitLab CI/CD variable has to hold the new value, so if the schedule
     now returns 401, check that variable first.
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

## SSO redirect hardening (fix-verification of 131bcd2, 2026-09-16)

Gate review of the E17 relative-redirect fix. The fix itself holds — verified
live: `GET /api/auth/logout` → `location: /login`, callback → `location:
/login?e=sso`, all four gates green, and the test genuinely fails when the fix
is reverted. These are the gaps the bypass review left open.

- [x] **FV-1 — the regression guard covers one syntax, not the defect class.**
  `tests/unit/sso-redirects.test.ts` scans route files for
  `new URL(…, req.url)`. Four other spellings of the same bug pass it:
  `req.nextUrl.clone()`, `new URL(req.url).origin + "/login"`, an aliased
  `const b = req.url`, and a bare `NextResponse.redirect(req.url)`. The fix
  converted every call site that exists today, so nothing is broken now — this
  is about the guard holding for the next author. Replace the syntax match with
  the rule the TRD actually states: no route under `app/api` may call
  `NextResponse.redirect` or set a `Location` header itself; redirects go
  through `relativeRedirect()`. One allow-listed exception: the Entra authorize
  URL in `app/api/auth/sso/start/route.ts`, which is an intentional absolute
  external redirect.

- [x] **FV-2 — E17's stated mechanism does not match production.** The TRD
  (`docs/trd-m365-sso-auth.md` E17) and the test file's header both explain
  middleware being unaffected as "nextUrl carries the forwarded host", which
  implies an absolute `Location` with the right host. Live, a middleware
  redirect returns `location: /login?next=%2Finitiatives` — relative. The
  conclusion is right and `proxy.ts` needs no change; the explanation describes
  behavior that isn't what the server does. Correct the wording so the next
  person debugging a redirect isn't working from a wrong model.

- [x] **FV-5 — `proxy.ts` is correct only because Next rewrites its redirect.**
  Found while correcting FV-2, then traced to the exact mechanism.

  **What the code does.** `proxy.ts` builds an absolute URL from
  `req.nextUrl.clone()` and returns `NextResponse.redirect(url)` — the same
  shape as the E17 defect. Driven directly with an internal-origin request it
  emits `http://0.0.0.0:8080/login?next=%2Finitiatives`.

  **Why production is fine anyway.** Next post-processes the response:
  `next/dist/server/web/adapter.js` ~line 363 and
  `server/lib/router-utils/resolve-routes.js` ~line 489 both call
  `getRelativeURL()`, which strips the origin when the redirect host equals the
  request host. The browser therefore receives `location: /login?next=...`
  (confirmed live 2026-09-16).

  **The named trigger.** That rewrite is gated on
  `!process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE`, which is set by the
  documented `skipProxyUrlNormalize` config option. Turning that flag on — a
  legitimate thing to do for `_next/data` path handling — switches the rewrite
  off and reproduces the E17 outage on **every gated page redirect**, i.e. the
  whole auth perimeter, not just SSO. The flag is not set today (`next.config.ts`
  is clean). *Now guarded — see Option B.*

  **Option A — make `proxy.ts` emit a relative `Location` itself. Ruled out.**
  `adapter.js` re-parses the header with `new NextURL(location, …)` before
  deciding whether to relativize, and `NextURL` throws `TypeError: Invalid URL`
  on a relative input (verified against 16.2.10 with a `Headers` instance, a
  plain object, and no headers). There is no `try`/`catch` around it, so this
  would most likely 500 every gated navigation. Do not do this.

  **Option B — remove the trigger instead of the dependency. DONE 2026-09-16.**
  Assert in a test that `next.config.ts` sets neither `skipProxyUrlNormalize`
  nor the deprecated `skipMiddlewareUrlNormalize`, with a comment in
  `next.config.ts` pointing at E17. ~10 lines, no runtime change, no deploy
  risk, and it closes the only concrete way this breaks. Does not protect
  against Next changing the normalization in a future major — the e2e suite and
  the post-deploy `curl -D -` remain the backstop for that.

  **Option C — redirect to a configured public origin.** Keep
  `NextResponse.redirect` (so the `NextURL` parse still gets an absolute URL) but
  build it from an `APP_ORIGIN` env var instead of `nextUrl`, so the target is
  right whether or not normalization runs. Removes the dependency properly, but
  adds an env var that must be set on every deployment, and a wrong or missing
  value breaks sign-in — more blast radius than the bug it prevents. Worth it
  only if the app ever moves behind a different proxy or gains a second
  hostname. Trusting `x-forwarded-host` instead of a config value is **not** an
  acceptable substitute: it makes the redirect target attacker-controlled.

- [x] **FV-3 — `relativeRedirect` appends its query inside a fragment.**
  `src/lib/redirect.ts` builds the `Location` by string concat, so
  `relativeRedirect("/x#frag", { e: "sso" })` yields `/x#frag?e=sso` — the
  query lands in the fragment and the server never sees it. Unreachable today
  (the only caller passing params passes the literal `/login`), but
  `sanitizeNext` does permit `#`, so a future `next=/initiatives#tab` plus a
  param would hit it. Split the fragment off before appending.

- [x] **FV-4 — stale duplicated files in `.next/types` break the `tsc` gate.**
  `npx tsc --noEmit` failed with duplicate-identifier errors from
  `cache-life.d 2.ts`, `routes.d 2.ts` and `validator 2.ts` — Finder/iCloud
  copies inside generated output, nothing to do with any source change. A fresh
  build does not recreate them, so deleting is safe, but the DoD's typecheck
  gate fails on any machine that has them and the error looks like a real type
  error. Make the gate immune rather than relying on remembering to clean.

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
