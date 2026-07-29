# Task breakdown — M365 (Entra ID) SSO login

Executable plan for [TRD-2026-009](trd-m365-sso-auth.md). Do epics in order; do not start an epic before the previous epic's **gate** passes. Everything ships behind `FEATURE_SSO` (default off) until E6 cutover. Auth is the highest-risk area — test-first, and never break the existing password paths.

**Config (env, both dev + prod):** `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_REDIRECT_URI`, `FEATURE_SSO`.

---

## E1 — Identity data foundation
- **T1.1** Add `roleEnum` (`viewer|admin|super`) to schema. Extend `users`: add `role` (default `viewer`), `entra_oid` (nullable, unique), `last_login_at` (nullable); make `password_hash` **nullable**.
- **T1.2** Migration + backfill: existing rows → `role = is_super ? 'super' : 'admin'` (all current rows are admins). Keep `is_super` for now (drop in a later cleanup). Additive.
- **T1.3** `authorized-users.ts` service (sole writer of the allow-list): `listAuthorized`, `upsertAuthorized(email, role, byId)`, `setActive`, `findByOidOrEmail`, `bindOid`, `assertNotLastSuper`.
- **Gate:** unit/integration — backfill maps roles correctly; last-super guardrail blocks removing/deactivating the only super; email normalized (lowercase/trim); oid bind is idempotent.

## E2 — OIDC plumbing (Node only; proxy stays Edge/cookie-only)
- **T2.1** Add `openid-client`. `sso-config.ts`: discovery from `https://login.microsoftonline.com/<tenant>/v2.0`, client from env, scopes `openid profile email`, redirect from env. Throws clearly if `FEATURE_SSO` on but env missing.
- **T2.2** `GET /api/auth/sso/start`: generate PKCE verifier + `state` + `nonce`, stash them in a short-lived signed cookie, sanitize `next` (local-path only), redirect to Entra.
- **T2.3** `GET /api/auth/sso/callback`: validate `state`, exchange code (PKCE), validate `id_token` (sig via JWKS, iss, aud, exp/nbf±skew, nonce). Extract `oid`, `email = preferred_username||email` (lowercased), `name`.
- **T2.4** Pure helpers (unit-tested): `sanitizeNext(raw)` (reject `//`, schemes, non-`/`), `claimsToIdentity(claims)`.
- **Gate:** unit — sanitizeNext rejects open-redirects; claimsToIdentity picks the right email + oid; config throws on missing env. (Real Entra is mocked; never hit the live IdP in tests.)

## E3 — Authorization + session
- **T3.1** In the callback, after identity: `findByOidOrEmail`; if found+active → `bindOid` (first time), `last_login_at`, issue iron-session with `role/userId/email/name` (admin TTL for admin/super, viewer TTL for viewer); redirect to `next`. If not found/inactive → render **not-authorized** page, no session.
- **T3.2** Rate-limit the callback (reuse IP limiter). Log token-validation failures via `captureError` (trace id).
- **Gate:** integration — allow-listed viewer/admin/super each get the right session; unknown email → no session + message; inactive → no session; oid rebinds when email changed.

## E4 — Guard hardening (immediate revocation for privileged actions)
- **T4.1** `requireAdmin`/`requireSuper` re-read current `role`+`active` from DB by `userId` (not just the cookie); deny if downgraded/inactive. Viewer read stays cookie-TTL.
- **T4.2** Keep `proxy.ts` coarse (cookie role) — unchanged. Document the split.
- **Gate:** integration — an admin whose row is set `viewer`/`active=false` is blocked from a write on the very next request, even with a valid admin cookie.

## E5 — Login experience
- **T5.1** Login page: primary **"Sign in with Microsoft"** (→ `/api/auth/sso/start`, only when `FEATURE_SSO`); secondary small links "Use shared password" (D2) and "Admin password sign-in" (break-glass, D4). Preserve `?next`.
- **T5.2** Not-authorized page (clear copy, sign-out link). Logout clears local session only (E15).
- **T5.3** Optional super-admin toggle to disable the shared-password path (E12) — `app_config.viewer_password_enabled`.
- **Gate:** Playwright — SSO button visible under flag; fallback paths still work; not-authorized renders; deep-link `next` survives.

## E6 — Access admin panel + cutover
- **T6.1** Admin → **Access** panel: list authorized users; add email + role; toggle active; change role; last-super guardrail; self-change warning. `/api/admin/access` (super-only).
- **T6.2** Seed the allow-list from current admins (map `users`→roles); add the initial SSO super-admin(s) by email.
- **T6.3** Cutover: register redirect URIs + secret in env, turn `FEATURE_SSO=1`, announce. Keep shared password until adoption confirmed, then optionally disable (T5.3).
- **Gate:** 3-role journeys via SSO (mocked) + break-glass + shared-password; last-super protection; fresh-tenant bootstrap.

---

### Cross-cutting
- **Security:** auth-code+PKCE only; validate sig/iss/aud/exp/nonce; single-tenant; httpOnly+secure+sameSite cookie; no Graph scopes / no refresh token; no PII in `usage_events`.
- **Rollback:** flag off → password-only; schema changes additive/nullable (§13 of the TRD).
- **Not in scope:** SCIM provisioning, Entra groups/App-Roles, per-record permissions, Entra front-channel logout.
