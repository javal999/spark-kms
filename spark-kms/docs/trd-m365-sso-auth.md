---
doc_id: TRD-2026-009
doc_type: trd
project: spark-kms
systems: [spark-kms, microsoft-entra-id]
vendors: [microsoft]
status: draft
owner: levi
engineer_signoff: null
last_verified: 2026-07-28
supersedes: null
related: [trd-error-observability.md]
tier: full
---

# TRD — Microsoft 365 (Entra ID) SSO login with in-app role assignment

## 1. Basics

| | |
|---|---|
| **Problem** | Login today is a single shared viewer password + individual admin password accounts. We want employees to sign in with their **Microsoft 365** identity (no new password), default everyone to **view-only**, and let a few named people be **admin / super-admin**. |
| **Goal** | Add M365 (Entra ID) SSO as the primary front door. An **allow-list keyed by email** decides who can sign in at all and at what role. Keep a shared-password fallback (non-M365 users) and one break-glass super-admin. |
| **Owner** | Levi (PM) |
| **Engineer signoff** | _none yet — required before Approved_ |
| **Tier** | Full (crosses an external vendor boundary: Microsoft Entra ID) |

## 2. Glossary

| Term | What it is |
|---|---|
| **Microsoft Entra ID** | Microsoft's identity provider (formerly Azure AD) behind M365 sign-in. |
| **OIDC** | OpenID Connect — the sign-in protocol we use on top of OAuth 2.0. |
| **Auth-code + PKCE** | The secure browser sign-in flow: app redirects to Microsoft, gets a one-time code back, exchanges it server-side for tokens. PKCE prevents code interception. |
| **id_token** | A signed token Microsoft returns proving who signed in (contains email, name, `oid`). |
| **`oid`** | Entra **object id** — a stable, unique id for a person that never changes even if their email/name does. |
| **Allow-list** | Our `authorized_users` table: one row per authorized person = `email → role`. Governs SSO sign-in. |
| **Break-glass** | A local password super-admin used only for emergency recovery (Entra outage/misconfig). |
| **`proxy.ts`** | The Edge route-gate; only *decrypts* the session cookie (no DB). `[S: proxy.ts]` |
| **iron-session** | The sealed, encrypted cookie holding the session (`role`, `userId`, …). `[S: session-config.ts]` |

## 3. Current state `[S: repo]`

- **Session:** iron-session sealed cookie `spark_session`; roles `viewer | admin | super`; TTL viewer 30d / admin 7d. `[S: session-config.ts]`
- **Login** (`/api/auth/login`): email+password → `users` row (argon2) → admin/super by `is_super`; password-only → viewer via `app_config.viewer_password_hash`. IP rate-limited. `[S: app/api/auth/login/route.ts]`
- **Gate** (`proxy.ts`): `/login` public; `/admin` super-only; `/submit` admin+; else any authenticated. Fine-grained checks live in route handlers/guards. `[S: proxy.ts, guards.ts]`
- **Users table:** `id, email (unique), name, password_hash (NOT NULL), is_super, active`. Admins/supers only — viewers have no row. `[S: schema.ts]`

## 4. Goals / Non-goals

**Goals**
- Sign in with M365 (Entra ID) via OIDC.
- Allow-list (email → role) is the single source of truth for who gets in and at what role.
- Default role = **viewer** (read-only); a few emails = admin/super.
- Shared viewer password kept as a fallback path; one break-glass super-admin.

**Non-goals (this doc)**
- SCIM/automatic user provisioning from Entra.
- Entra security-groups / App-Roles-driven authorization (we chose in-app assignment). `[decided 2026-07-28]`
- Per-record permissions beyond the existing role tiers.
- Signing users out of M365 itself on app logout.

## 5. Decisions (confirmed 2026-07-28)

| # | Decision | Choice |
|---|---|---|
| D1 | How admins are granted | **In-app**: a super-admin authorizes emails in the Admin console. |
| D2 | Shared viewer password | **Kept as a fallback** for non-M365 users (contractors). Viewer-only; can be disabled later. |
| D3 | Sign-in scope | **Allow-listed only** — an M365 user not on the list is refused (not even viewer). |
| D4 | Break-glass | **Keep one** local password super-admin for emergency recovery. |

## 6. Design

### 6.1 Identity model — one allow-list, one role each `[A]`
Extend the identity store so it holds **every** authorized person (viewers included), not just admins:

- `email` (unique, lowercased) — how a super-admin adds someone.
- `role` — `viewer | admin | super` (replaces the `is_super` boolean; migrate existing `is_super=true → super`, else `admin`).
- `entra_oid` (nullable) — bound on the person's **first** SSO login; thereafter the authoritative match key (survives email changes).
- `password_hash` (nullable) — set **only** for the break-glass account (and any legacy password admin we keep). SSO users have none.
- `active`, `assigned_by`, `created_at`, `last_login_at`.

The shared viewer password stays in `app_config` unchanged (D2). This one table is simultaneously the **allow-list** (D3) and the **role map** (D1).

### 6.2 Sign-in flows + the experience (step-by-step)

**A. M365 SSO (the primary path)** `[A]`
1. User opens the app → not authenticated → `/login`.
2. Login page shows a primary **"Sign in with Microsoft"** button (and a small "Use shared password" link for D2).
3. Click → server starts OIDC auth-code+PKCE: redirect to Entra with `state` (CSRF) + `nonce` (replay) + the sanitized `next` deep-link.
4. User authenticates at Microsoft (often already signed in → silent) and, first time only, consents.
5. Entra redirects back to `/api/auth/sso/callback` (Node runtime). Server validates the `id_token` (signature via JWKS, issuer, audience, `exp`/`nbf` with small skew, `nonce`), and reads verified `email` + `oid` + `name`.
6. **Authorization:** look up the person in `authorized_users` (by `oid`, else by `email` and bind `oid`), `active = true`.
   - **Found** → issue an iron-session with their role (viewer/admin/super); update `last_login_at`; redirect to the sanitized `next` (default dashboard).
   - **Not found / inactive** → **no session**; show a clear page: *"Your Microsoft account (x@paragon…) isn't authorized for SPARK yet. Ask a SPARK admin to add you."*

**B. Shared-password fallback (D2)** — unchanged existing path: enter the shared password → viewer session. This is an **explicit bypass of the allow-list** for people without M365; viewer-only, rotatable, and disableable via a super-admin toggle. `[S: existing login route]`

**C. Break-glass (D4)** — a secondary "Admin password sign-in" form (the existing email+password path) authenticates the local super-admin whose `password_hash` is set. Used only for recovery; every use is written to the error/audit log.

### 6.3 Role enforcement — coarse gate + authoritative re-check `[A]`
- **`proxy.ts` (Edge)** stays coarse: it trusts the cookie `role` for page routing (`/admin`, `/submit`). No DB in the Edge. `[S: proxy.ts]`
- **Guards (Node)** become **authoritative** for every write/admin action: `requireAdmin`/`requireSuper` re-read the person's **current** `role` + `active` from the DB (by `userId`/`oid`), not just the cookie. This makes **revocation immediate** for privileged actions even while a 7-day admin cookie is still sealed. `[A]` — this is the load-bearing change; see edge case E3.

### 6.4 Role management UX (super-admin) `[A]`
Admin → **Access** panel (evolves the current PIC/People pattern): list authorized users; add an email + pick role; toggle active; change role. Guardrails: cannot remove/deactivate the last active super-admin; changing your own role warns.

## 7. Integration & responsibility (Entra boundary)

| Item | Owner | Status |
|---|---|---|
| Entra **app registration** | Provided 2026-07-28 | **Application (client) id** `377a3859-6b95-4c02-a928-a0d1ef13ef92`; **Directory (tenant) id** `d2c344e6-6226-4afa-944a-62d6ce0d98c2`. `[S: Levi]` |
| **Client secret** → `AZURE_CLIENT_SECRET` in env | Levi | **Pending** — create in the app registration, add to `.env` + deploy env. Never in git. |
| **Redirect URIs** registered | Levi | **Pending confirm** — `http://localhost:3000/api/auth/sso/callback` (dev) + `https://kms.paracorplabs.com/api/auth/sso/callback` (prod). Must match exactly. |
| **Admin consent** for scopes `openid profile email` | Paragon IT | Granted once for the tenant (needed on first sign-in). |
| Tenant restriction (single-tenant) | IT | Authority `https://login.microsoftonline.com/d2c344e6-…/v2.0` → only Paragon tenant accounts; blocks personal/guest (E9). |
| Verified-email claim | **Resolved** | Match `preferred_username` (UPN), lowercased; `email` as fallback; `oid` is the stable key. `[A]` |

## 8. Data contract

**Consumed from the `id_token`** (only these; nothing else stored): `oid` (stable id), verified work `email`, `name`, `nonce`. We do **not** request Graph/API scopes or a refresh token — a single sign-in assertion is enough to establish who they are. `[A]`

**`authorized_users`** as in §6.1. Usage tracking stays **pseudonymous** — even though we now know the viewer's identity, `usage_events` must keep storing only the HMAC `actorHash`, never the email, per the privacy notice. `[S: privacy-notice-usage-tracking.md]`

## 9. Failure modes & edge cases

| # | Case | Handling |
|---|---|---|
| E1 | M365 user not on the allow-list | Refused with a clear "ask an admin" message; no session (D3). |
| E2 | Person's **email changes** in Entra | Match on `oid` (bound at first login) so access survives. If email changes *before* first login, the admin re-adds the new email. |
| E3 | **Role revoked / downgraded mid-session** | Admin/super **write** actions re-check DB role+active in guards → blocked immediately. Viewer read access ends at cookie TTL (acceptable; read-only). Hard offboarding: set `active=false` → write actions blocked at once; to also cut viewing immediately, bump a per-user `auth_epoch` sealed in the session (optional, see [OPEN]). |
| E4 | **Entra outage** | Break-glass super-admin (D4) + shared viewer password (D2) still work → no full lockout. |
| E5 | User **offboarded/disabled in Entra** | Entra refuses to issue a token → no new sessions. Existing session dies at TTL, or immediately if a super-admin deactivates them (E3). |
| E6 | **Open-redirect** via `next=` | Accept only a local path (`^/` and not `//` or a scheme); else default to `/`. Carried through `state`, re-validated on callback. `[S: proxy uses ?next]` |
| E7 | CSRF / token **replay** | `state` (CSRF) + `nonce` (bound in id_token) + PKCE; one-time state; short state TTL. |
| E8 | id_token **signature/issuer/audience/expiry** wrong | Reject the sign-in; log a captured error (trace id, TRD-2026-008). Small clock-skew leeway on `exp`/`nbf`. |
| E9 | **Guest / personal Microsoft** account | Single-tenant app registration + allow-list → double-gated out. |
| E10 | **Bootstrap** (no authorized_users yet) | Seed the break-glass super-admin first; they sign in (password) and add the SSO admins. |
| E11 | **Last super-admin** removed/deactivated | Blocked by a guardrail; at least one active super-admin must remain. |
| E12 | Shared-password **bypass** weakens the allow-list | Deliberate (D2). Mitigate: viewer-only, rotatable, and a super-admin **toggle to disable it** entirely once everyone has M365. |
| E13 | Email **case / whitespace** mismatch | Normalize to trimmed lowercase on both add and login. |
| E14 | **Rate-limit / abuse** on callback | Reuse the existing IP limiter on the callback + password paths. |
| E15 | **Logout** | Clears the local session cookie only; user stays signed into M365 (can re-SSO instantly). Front-channel Entra logout is out of scope (Non-goals). |
| E16 | Break-glass **credential hygiene** | Strong unique password, not tied to a person, use logged, rotated periodically. |
| E17 | **Redirect origin behind the proxy** *(found 2026-09-11)* | Every redirect an API route sends is **relative** (`Location: /login?e=sso`) via `relativeRedirect()` in `src/lib/redirect.ts` (same-site paths only, so it cannot become an open redirect; params are inserted *before* any `#fragment`, since `/x#frag?e=sso` would hide the query inside the fragment); the browser resolves it against the public host it is already on. Never `new URL(path, req.url)`: in the standalone build a route handler's `req.url` carries the bind address `0.0.0.0:8080`, not the forwarded host, so the first successful prod sign-in was sent to `https://0.0.0.0:8080/`. It went unseen while sign-ins failed earlier on a placeholder client secret (deployments 31–32). Page redirects in `proxy.ts` are unaffected **in production, verified at the wire** (2026-09-16: `GET /initiatives` unauthenticated returns `location: /login?next=%2Finitiatives`, relative, so it cannot reach the bind address) — but *not* because the code prevents it. `proxy.ts` builds an absolute URL from `req.nextUrl`, and driven directly with an internal-origin request it emits `http://0.0.0.0:8080/login?next=…`. Its safety rests on Next stripping the origin from a same-origin redirect (`getRelativeURL()` in `adapter.js` / `resolve-routes.js`) — a rewrite gated on the documented `skipProxyUrlNormalize` config option, so turning that flag on would reproduce this outage across the whole page auth perimeter. Guarded since 2026-09-16 (FV-5): `tests/unit/sso-redirects.test.ts` fails if `next.config.ts` sets `skipProxyUrlNormalize` or the deprecated `skipMiddlewareUrlNormalize`, or if the `Dockerfile` sets the internal flag; `next.config.ts` carries the warning inline. Rejected alternatives in `BACKLOG.md` FV-5. `tests/unit/sso-redirects.test.ts` fails if any `app/api` route redirects on its own at all — `NextResponse.redirect` or a hand-written `Location` header — instead of going through `relativeRedirect()`; the single allow-listed exception is the off-site Entra authorize redirect in `sso/start`. The rule is the route, not one spelling: `req.nextUrl.clone()`, `new URL(req.url).origin` and an aliased `req.url` all rebuild the internal origin too. |

## 10. Environments & cutover `[A]`

- **One app registration, both redirect URIs** (dev `localhost:3000` + prod), since we have a single tenant. `[decided 2026-07-28]`
- **Env vars** (both dev `.env` and Lightsail deploy env): `AZURE_TENANT_ID=d2c344e6-6226-4afa-944a-62d6ce0d98c2`, `AZURE_CLIENT_ID=377a3859-6b95-4c02-a928-a0d1ef13ef92` (non-secret, may also be defaults), `AZURE_CLIENT_SECRET=<from Entra>` (secret — env only, never git), `AZURE_REDIRECT_URI=<per env>`, `FEATURE_SSO=1`.
- **Cutover:** ship SSO **alongside** the existing password paths (no big-bang). Seed the allow-list from the current admins (map `users` → roles). Announce "Sign in with Microsoft." Keep the shared password until adoption is confirmed, then optionally disable it (E12).

## 11. Rollout / build plan (step-by-step)

1. **Entra app registration** (IT) — client id/secret, redirect URIs, admin consent. *(blocks 3+)*
2. **Data migration** — `users` → allow-list model: add `role` (backfill from `is_super`), make `password_hash` nullable, add `entra_oid`, `last_login_at`. Additive + one enum backfill.
3. **OIDC callback** — `/api/auth/sso/{start,callback}` (Node): PKCE+state+nonce, JWKS validation, `next` sanitization. Behind a `FEATURE_SSO` flag.
4. **Authorization + session** — allow-list lookup (oid→email bind), issue role session; not-authorized page.
5. **Guard hardening** — `requireAdmin/Super` re-check DB role+active (E3).
6. **Login page** — "Sign in with Microsoft" primary; shared-password + break-glass secondary.
7. **Access admin panel** — add/deactivate/role, with the last-super guardrail.
8. **Tests** — allow-listed viewer/admin/super sign-in; not-authorized refusal; oid rebind on email change; revoked-admin write blocked; break-glass; open-redirect rejected; token-validation failures. (Mock Entra; never hit the real IdP in tests.)
9. **Cutover** per §10; then optionally disable the shared password.

## 12. Open questions

_Resolved 2026-07-28:_
- Entra app registration — **provided** (client `377a3859…`, tenant `d2c344e6…`). Remaining: Levi creates the **client secret** + confirms **redirect URIs** (build tasks, not design questions).
- Verified-email claim — **`preferred_username` (UPN) lowercased**, `email` fallback, `oid` stable key.
- Offboarding cutoff — **v1 accepts the viewer TTL window**; admin/super writes cut off immediately (DB re-check). Per-user `auth_epoch` deferred to a later phase.
- Legacy password admins — **kept working** (backward-compatible) alongside SSO; break-glass is one designated super-admin.

_Still open:_
- **[OPEN — admin consent granted for the tenant? owner Paragon IT — needed before the first real sign-in succeeds.]**

## 13. Rollback
SSO ships behind `FEATURE_SSO`; turning the flag off reverts the login page to password-only — the existing paths are untouched and remain functional throughout. The schema changes are additive (nullable columns + a role enum backfilled from `is_super`), so no data is destroyed; a revert leaves the columns unused. No irreversible step.

## 14. Security notes
Auth-code+PKCE only (no implicit flow); server-side token exchange; validate signature/issuer/audience/`exp`/`nonce`; single-tenant; httpOnly+secure+sameSite cookie (unchanged); allow-list + tenant = defence in depth; guards re-check DB for privileged actions; break-glass and shared-password use are logged. No Graph scopes, no refresh token, no PII in usage events.

## 15. Signoff
Requires one engineer to verify the Design + Integration sections (replace every `[A]`), and IT to confirm the `[OPEN]` Entra facts, before status moves to Approved. Vendor-facing config (redirect URIs, consent) is a draft until IT acknowledges it.
