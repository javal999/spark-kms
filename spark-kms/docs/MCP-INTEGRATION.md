# SPARK KMS — MCP Integration Guide

For teams who want to **query the SPARK knowledge base from an AI assistant**
(Claude Desktop, Claude Code, or any MCP-capable client) or over plain REST.

The SPARK Knowledge Management System holds the marketing/sales **initiatives**
(topics), their **progress entries**, and the **4-stream point leaderboard** by
Region × Segment. This guide is how another team connects and pulls that
information.

- **Live endpoint (MCP):** `https://kms.paracorplabs.com/api/mcp`
- **Transport:** streamable HTTP
- **Auth:** `Authorization: Bearer <API_KEY>`
- **Rate limit:** 60 requests / minute per key

---

## 1. Get an API key

API keys are issued inside the app by a **SPARK KMS super-admin**
(Admin → API keys). Ask the SPARK team to mint you one:

- Choose **`read`** scope if you only need to retrieve information (the usual
  case for another team). A read key can call every query tool but **cannot**
  create or modify anything.
- **`write`** scope additionally allows creating initiatives and appending
  entries — request this only if you have a reason to write into SPARK.

The key looks like `spark_sk_XXXXXXXX…`. **It is shown only once** — store it
somewhere safe (a password manager or your client's secret store). If it leaks,
the SPARK team can revoke it instantly and issue a new one.

> A key acts on behalf of the SPARK user who created it, and every write is
> audited. Treat it like a password.

---

## 2. Connect from an MCP client

### Claude Desktop / Claude Code (via `mcp-remote`)

Most desktop clients speak MCP over stdio, so we bridge to the remote HTTP
endpoint with `mcp-remote`. Add this to your MCP config
(`claude_desktop_config.json`, or `.mcp.json` for Claude Code):

```json
{
  "mcpServers": {
    "spark-kms": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://kms.paracorplabs.com/api/mcp",
        "--header",
        "Authorization: Bearer spark_sk_YOUR_KEY_HERE"
      ]
    }
  }
}
```

Restart the client. You should see a **spark-kms** server with 7 tools. Then
just ask in plain language, e.g. *"Search SPARK for pop-up store initiatives"*
or *"What's the current area leaderboard in SPARK?"*.

### Any client that supports remote MCP + a custom header

Point it at `https://kms.paracorplabs.com/api/mcp` and set the request header
`Authorization: Bearer <your key>`. No OAuth flow — it's a static bearer key.

### Quick test with curl

```bash
KEY=spark_sk_YOUR_KEY_HERE
curl -sN https://kms.paracorplabs.com/api/mcp \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"search_initiatives","arguments":{"q":"popup"}}}'
```

---

## 3. The tools

Read tools work with any key; write tools require a `write` key.

| Tool | Scope | What it does |
|---|---|---|
| `search_initiatives` | read | Search initiatives across title, description, and entry details, with filters. Returns `{ rows, total }`. |
| `get_initiative` | read | One initiative by `id` with its full entry timeline, action items, stage history, and per-stream points. |
| `get_top_initiatives` | read | Initiatives ranked by total points (all-time or a specific week). |
| `get_leaderboard` | read | The Region × Segment area leaderboard with per-stream points and totals. |
| `get_dashboard_summary` | read | Counts: total initiatives, new this week, and distributions by stage / pillar / region / segment. |
| `create_initiative` | write | Create a new initiative + first progress entry. |
| `add_entry` | write | Append a progress entry to an existing initiative. |

### Common parameters & allowed values

- **region:** `Jakarta Greater`, `Kalimantan`, `Sumatera`, `CJWJ`, `EJBN`
- **segment:** `Halal PC`, `Teen & ES`, `Masstige`, `All`
- **pillar:** `Social Buzz`, `Personalized CRM`, `Relevant Beauty Lifestyle`, `Activated New Touchpoint`, `Key Territory Execution`
- **stage:** `Idea`, `Pilot`, `Running`, `Ready to Scale`
- **category:** `Best Practice`, `Unlocking`
- **week:** ISO week key like `2026-W27` (Monday-based, Asia/Jakarta). Omit for all-time.

### `search_initiatives` arguments

| Arg | Type | Notes |
|---|---|---|
| `q` | string | Free-text; matches title, description, and entry detail |
| `region` / `segment` / `pillar` / `stage` | string[] | Each list ORs its values; filters are ANDed |
| `category` | string | `Best Practice` or `Unlocking` |
| `page` / `pageSize` | number | Pagination (pageSize ≤ 200) |

Example: *"Find running Best-Practice initiatives in EJBN about CRM."*

---

## 4. Prefer plain REST? (no MCP)

The same data is available as a normal REST API with the same keys.

- **Interactive docs:** <https://kms.paracorplabs.com/api/docs>
- **OpenAPI 3.1 spec:** <https://kms.paracorplabs.com/api/openapi.json>

```bash
curl https://kms.paracorplabs.com/api/v1/initiatives?q=popup \
  -H "Authorization: Bearer $KEY"
```

Read endpoints: `/api/v1/initiatives`, `/api/v1/initiatives/{id}`,
`/api/v1/dashboard`, `/api/v1/leaderboard`, `/api/v1/top-initiatives`.

---

## 5. Good to know

- **Read keys are safe to share within your team** but still secret — anyone
  with the key can read the whole knowledge base.
- **What's never exposed:** confirming Best-Practice-of-the-Week, manual point
  awards, score adjustments, and any user / password management. Those stay
  inside the SPARK app.
- **A BP-of-week flag on a write is only a nomination** — it never awards points
  until a SPARK super-admin confirms it in the app.
- **Errors you might see:** `401` invalid/revoked key · `403` your key lacks
  `write` scope · `409` a similar initiative already exists (a write returned
  candidates to reconcile) · `429` you exceeded 60 req/min.

Questions or need a key? Contact the SPARK KMS team.
