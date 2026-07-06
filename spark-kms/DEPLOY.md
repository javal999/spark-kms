# SPARK KMS — deployment & operations

## Stack
Next.js 16 (App Router) · PostgreSQL (`pg_trgm`) · Drizzle · iron-session · argon2.

## Environment secrets (required)
Set these in the host's env (never commit them — `.env*` is gitignored):

| Var | What | Notes |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | Must allow `CREATE EXTENSION pg_trgm` on first migrate |
| `SESSION_SECRET` | iron-session cookie key | **≥ 32 chars**, random. `openssl rand -base64 32`. Rotating it logs everyone out |

`TEST_DATABASE_URL` is dev/CI only. Never set `ALLOW_PROD_SEED=true` in production — the dev seed plants known-password admins and is refused when `NODE_ENV=production`.

## First deploy
1. Provision Postgres (Neon/Supabase free tier, or internal). Ensure `pg_trgm` is available.
2. Set env secrets.
3. `npm ci && npm run build`
4. `npm run db:migrate` (creates schema + `pg_trgm` + trigram index).
5. Provision the first super-admin and the viewer password **without the dev seed** — run a one-off script or SQL that inserts a `users` row with an argon2 hash and an `app_config` `viewer_password_hash`. (The dev seed is for local/CI only.)
6. `npm start` behind HTTPS. Cookies are `secure` in production (`NODE_ENV=production`), so the app **must** be served over TLS or sessions won't stick.

### Vercel + Neon
- Deploy the repo; set `DATABASE_URL` (Neon pooled URL) and `SESSION_SECRET` as project env vars.
- Run `npm run db:migrate` once against the Neon branch (locally or a one-off job).
- HTTPS is automatic.

### Internal server
- Node 20+, a reverse proxy (nginx/Caddy) terminating TLS in front of `next start`.
- systemd unit or PM2 for the process; `DATABASE_URL`/`SESSION_SECRET` in the unit's environment.

## Backups (requirements §9 — daily, 30-day retention)
- **Neon/Supabase:** enable managed PITR — that's the primary.
- **Secondary / internal:** cron `scripts/backup.sh` (pg_dump + gzip, prunes >30 days):
  ```
  15 2 * * *  cd /app && DATABASE_URL=... BACKUP_DIR=/var/backups/spark ./scripts/backup.sh
  ```
- Restore test quarterly.

## Operating cadence (requirements §10)
- **Monday scoring console** (super-admin): confirm BP-of-week nominations, log presenter/CEE points, resolve disputes via adjustments (note required).
- **Quarterly:** rotate the viewer password (Admin → Viewer password) — logs out all viewers.
- **Monthly:** stale-initiative review; check backups restore.

## Security checklist
- [x] argon2id password hashing (`@node-rs/argon2`).
- [x] HTTPS only (secure cookies in prod).
- [x] Login rate-limited (5 fails / 10 min / IP).
- [x] Route perimeter enforced by `proxy.ts`; API routes re-check role.
- [x] Upload capped at 10 MB; all-or-nothing; file-hash idempotency.
- [x] Score ledger is append-only (reversals, never deletes).
- [ ] Rate limiter is in-memory (single instance). If scaled horizontally, back it with Redis/Upstash.
