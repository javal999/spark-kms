# SPARK KMS

Internal web app that replaces the *SPARK Weekly Update* spreadsheet — an
initiative knowledge base, an event-sourced 4-stream point system, and a
Region × Segment area leaderboard for the marketing & sales teams.

**Live:** https://kms.paracorplabs.com

## Repository layout

| Path | What it is |
|---|---|
| `spark-kms/` | The Next.js application (app code, tests, Dockerfile, deploy runbooks) |
| `KMS-Requirements-Doc-v1.1.md` | Approved requirements — the source of truth for *what* to build |
| `KMS-Tech-Architecture-Task-Breakdown.md` | Stack, schema, API surface, and the phased task list — *how* it's built |
| `KMS-Upload-Template.xlsx` | Reference for the bulk-upload template generator |
| `CLAUDE.md` | Working rules for the project |

## Key documents

- **Run / develop the app:** [`spark-kms/README.md`](spark-kms/README.md)
- **Production (AWS Lightsail) runbook:** [`spark-kms/LIGHTSAIL-DEPLOY.md`](spark-kms/LIGHTSAIL-DEPLOY.md)
- **Integration API + MCP guide (for partner teams):** [`spark-kms/docs/MCP-INTEGRATION.md`](spark-kms/docs/MCP-INTEGRATION.md) · hosted at https://kms.paracorplabs.com/mcp-guide
- **Backlog / optional follow-ups:** [`spark-kms/BACKLOG.md`](spark-kms/BACKLOG.md)

## Status

All five build phases are complete, tested, and deployed to production:
knowledge base, event-sourced scoring, bulk upload, admin console, and the
integration API + MCP server.

## Remotes

- **Primary:** this GitLab project (`paragon-is/auth/org/pbs/kms-spark`).
- **Backup:** GitHub mirror — push with `git push github main`.

> Real business data (`SPARK WEEKLY UPDATE.numbers`, generated import files,
> `.env`) is git-ignored and never committed.
