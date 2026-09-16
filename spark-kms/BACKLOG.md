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

- [x] **FV-5 — `proxy.ts` relied on Next rewriting its redirect. Fixed by Option C.**
  Found while correcting FV-2.

  **What the code did.** `proxy.ts` built an absolute URL from
  `req.nextUrl.clone()` and returned `NextResponse.redirect(url)` — the E17
  defect shape. On a real standalone server the proxy's request URL carries the
  bind address even when the `Host` header is `kms.paracorplabs.com`, so the
  redirect it built was `http://0.0.0.0:8080/login?next=%2Finitiatives`.

  **Why production was fine anyway.** Next relativizes a same-origin redirect in
  two places: `server/web/adapter.js` (~line 363) and
  `server/lib/router-utils/resolve-routes.js` (~line 489). The browser received
  `location: /login?next=...` (confirmed live 2026-09-16).

  **Correction (2026-09-16).** An earlier version of this entry called the
  `skipProxyUrlNormalize` option a one-flag trigger for the outage, and shipped
  Option B to guard it. That was inferred from reading `adapter.js` alone. It was
  then disproved by building with the flag on and probing a real standalone
  server: the flag does switch off the `adapter.js` pass (it is a build-time
  define, `build/define-env.js:155`), but `resolve-routes.js` has no reference to
  it and still relativizes every proxy redirect — redirects stayed correct. The
  real dependency was that unflagged `resolve-routes.js` pass, which no option
  controls and a Next upgrade could change.

  **Option A — make `proxy.ts` emit a relative `Location` itself. Ruled out.**
  `adapter.js` re-parses the header with `new NextURL(location, …)`, and
  `NextURL` throws `TypeError: Invalid URL` on a relative input (verified against
  16.2.10 with a `Headers` instance, a plain object, and no headers). There is no
  `try`/`catch` around it, so this would most likely 500 every gated navigation.

  **Option B — guard the flag. Shipped, then removed the same day.** Its premise
  was the disproved claim above, so it guarded nothing. Its Dockerfile check was
  doubly moot: `__NEXT_NO_MIDDLEWARE_URL_NORMALIZE` comes from `next.config` at
  build time, so a runtime `ENV` cannot set it.

  **Option C — redirect to a configured public origin. DONE 2026-09-16.**
  `proxy.ts` builds redirects from `publicOrigin()` (`src/lib/redirect.ts`), which
  reads `APP_ORIGIN`. Unset falls back to the old behavior; invalid falls back
  and logs once — it never takes the perimeter down. Verified on a real
  standalone server, each probe checked against the server's own PID:
  with `APP_ORIGIN=https://kms.paracorplabs.com`, gated redirects are
  `https://kms.paracorplabs.com/login?next=%2Finitiatives` on the public host
  *and* the Lightsail default host, and stay so with `skipProxyUrlNormalize` on;
  unset gives the old relative redirect; `kms.paracorplabs.com` (no scheme) gives
  the old redirect plus one log line. `tests/unit/proxy-gate.test.ts` checks
  every access decision in both modes. Trusting `x-forwarded-host` instead of a
  config value is **not** an acceptable substitute: it makes the redirect target
  attacker-controlled.

  *Intended side effect:* a gated redirect on the raw Lightsail URL now lands on
  `kms.paracorplabs.com`. That is the canonical host, and SSO only works there.

  *Residual:* a deployment missing `APP_ORIGIN`, or with an invalid one, silently
  falls back to depending on `resolve-routes.js`. The post-deploy check in
  `LIGHTSAIL-DEPLOY.md` catches it: a gated page's `Location` must begin with
  `https://kms.paracorplabs.com/`.

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
