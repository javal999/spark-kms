# SPARK KMS — Backlog

Optional follow-ups. Nothing here is blocking — the app (Phases 1–5) is built,
tested, and live in production. These are "add when a real need shows up."

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

- [ ] **Mutation testing.** 143 tests pass, but the mutation gate
  (`stryker`) isn't set up. Add it to formally confirm the tests would catch
  regressions on critical paths (scoring, auth, API writes).

## Product / V2 roadmap (from earlier notes)

- [ ] Wrong-merge / detach UI (REQ-D4 — the `reverse*` scoring primitives already
  exist to support it).
- [ ] Semantic dedup, natural-language search, weekly digests, adopt-idea flow,
  attachments.
