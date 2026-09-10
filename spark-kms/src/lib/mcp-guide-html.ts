/**
 * Standalone, public HTML for the partner-team MCP/REST integration guide,
 * served at GET /mcp-guide (not linked in the app nav; direct-link only).
 * Self-contained (inline CSS, system + monospace fonts) so it needs no assets
 * and no auth. Keep in sync with docs/MCP-INTEGRATION.md.
 *
 * The "Allowed values" block renders from the enum constants rather than
 * repeating them. It was hand-written and had already drifted twice — it was
 * missing Sulawesi (D22) and the sixth pillar (D10) — which is the exact
 * failure D26 introduced `/guide` to prevent, on the one page partner teams
 * read to learn what the API accepts.
 */
import { REGIONS, SEGMENTS, PILLARS, CATEGORIES, STAGES } from "@/src/lib/enums";

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const codes = (vals: readonly string[]) =>
  vals.map((v) => `<code>${esc(v)}</code>`).join("");

export const MCP_GUIDE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SPARK KMS — MCP Integration Guide</title>
<meta name="description" content="Connect to the SPARK KMS knowledge base over MCP or REST." />
<meta name="robots" content="noindex" />
<style>
  :root {
    --ink: #12181f; --paper: #f4f7f6; --card: #ffffff; --line: #e2e9e8; --line-strong: #cfdad9;
    --text: #1b2529; --muted: #5e6f6f; --accent: #0f857c; --accent-deep: #0a5f58; --accent-lite: #e6f2f0;
    --amber: #9a5613; --amber-bg: #fbf1e4; --code-bg: #16212c; --code-text: #cdd8d7; --code-dim: #7f9695;
    --code-teal: #58d3c6; --code-amber: #e0a86a;
    --sans: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --mono: ui-monospace, "SF Mono", "JetBrains Mono", "Fira Code", Menlo, Consolas, monospace;
    --measure: 62rem;
  }
  * , *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; }
  body { background: var(--paper); color: var(--text); font-family: var(--sans); font-size: 17px; line-height: 1.65; -webkit-font-smoothing: antialiased; }
  a { color: var(--accent-deep); text-decoration: none; border-bottom: 1px solid var(--line-strong); }
  a:hover { color: var(--accent); border-color: var(--accent); }
  a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }

  .doc-bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: .7rem; padding: .85rem clamp(1.1rem, 4vw, 2.4rem); background: rgba(244,247,246,.85); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
  .doc-mark { width: 26px; height: 26px; border-radius: 6px; flex: none; background: var(--accent); display: grid; place-items: center; color: #fff; font-family: var(--mono); font-weight: 700; font-size: .82rem; }
  .doc-bar b { font-weight: 650; letter-spacing: -.01em; }
  .doc-bar > span.sub { color: var(--muted); font-family: var(--mono); font-size: .78rem; }
  .doc-bar .sp { flex: 1; }
  .doc-bar .live { display: inline-flex; align-items: center; gap: .4rem; font-family: var(--mono); font-size: .72rem; color: var(--accent-deep); }
  .doc-bar .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--accent-lite); }

  .wrap { max-width: var(--measure); margin: 0 auto; padding: 0 clamp(1.1rem, 4vw, 2.4rem); }

  .hero { padding: clamp(2.6rem, 7vw, 4.6rem) 0 2.2rem; }
  .eyebrow { font-family: var(--mono); font-size: .74rem; letter-spacing: .16em; text-transform: uppercase; color: var(--accent-deep); margin: 0 0 1rem; }
  .hero h1 { font-size: clamp(2rem, 5.2vw, 3.05rem); line-height: 1.05; letter-spacing: -.025em; font-weight: 700; margin: 0 0 .9rem; text-wrap: balance; color: var(--ink); }
  .hero p.lead { font-size: 1.15rem; color: var(--muted); margin: 0; max-width: 40rem; }

  .spec { margin-top: 2.2rem; background: var(--ink); border-radius: 14px; padding: 1.5rem clamp(1.2rem, 3vw, 2rem); display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1.2rem 2rem; box-shadow: 0 20px 40px -24px rgba(18,24,31,.55); }
  .spec .row { display: flex; flex-direction: column; gap: .3rem; min-width: 0; }
  .spec dt { font-family: var(--mono); font-size: .68rem; letter-spacing: .14em; text-transform: uppercase; color: var(--code-dim); }
  .spec dd { margin: 0; font-family: var(--mono); font-size: .92rem; color: var(--code-text); word-break: break-word; }
  .spec dd.big { color: var(--code-teal); font-size: .98rem; }

  section.blk { padding: 2.4rem 0; border-top: 1px solid var(--line); }
  .step-h { display: flex; align-items: baseline; gap: .8rem; margin: 0 0 .4rem; }
  .step-n { font-family: var(--mono); font-size: .8rem; font-weight: 700; color: #fff; background: var(--accent); border-radius: 999px; padding: .12rem .6rem; letter-spacing: .04em; flex: none; }
  h2 { font-size: 1.5rem; letter-spacing: -.015em; font-weight: 650; margin: 0; color: var(--ink); text-wrap: balance; }
  .blk > .wrap-inner { margin-top: 1rem; }
  h3 { font-size: 1.02rem; font-weight: 650; margin: 1.8rem 0 .6rem; color: var(--ink); }
  p { margin: .8rem 0; max-width: 42rem; text-wrap: pretty; }
  .muted { color: var(--muted); }
  code.inl { font-family: var(--mono); font-size: .86em; background: #eaf1f0; color: var(--accent-deep); padding: .1em .38em; border-radius: 5px; }

  .code { position: relative; margin: 1.1rem 0; border-radius: 12px; overflow: hidden; border: 1px solid #24313d; }
  .code .top { display: flex; align-items: center; gap: .5rem; padding: .55rem .9rem; background: #111a23; border-bottom: 1px solid #24313d; }
  .code .top .fname { font-family: var(--mono); font-size: .72rem; color: var(--code-dim); letter-spacing: .03em; }
  .code .top .tl { display: flex; gap: .4rem; }
  .code .top .tl i { width: 10px; height: 10px; border-radius: 50%; background: #33424f; }
  .code pre { margin: 0; padding: 1rem 1.1rem; overflow-x: auto; background: var(--code-bg); }
  .code code { font-family: var(--mono); font-size: .84rem; line-height: 1.6; color: var(--code-text); white-space: pre; }
  .code .k { color: var(--code-teal); } .code .s { color: #a9d6a0; } .code .c { color: var(--code-dim); } .code .a { color: var(--code-amber); }

  .note { display: flex; gap: .75rem; padding: .95rem 1.1rem; border-radius: 10px; margin: 1.2rem 0; font-size: .95rem; }
  .note .ic { font-family: var(--mono); font-weight: 700; flex: none; }
  .note.tip { background: var(--accent-lite); color: #12463f; } .note.tip .ic { color: var(--accent); }
  .note.warn { background: var(--amber-bg); color: #6c3d0c; } .note.warn .ic { color: var(--amber); }

  .pill { font-family: var(--mono); font-size: .68rem; font-weight: 600; letter-spacing: .04em; padding: .12rem .5rem; border-radius: 999px; display: inline-block; vertical-align: middle; }
  .pill.read { background: var(--accent-lite); color: var(--accent-deep); }
  .pill.write { background: var(--amber-bg); color: var(--amber); }

  .tbl-wrap { overflow-x: auto; margin: 1.1rem 0; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
  table { border-collapse: collapse; width: 100%; font-size: .92rem; min-width: 520px; }
  th, td { text-align: left; padding: .7rem .95rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  thead th { font-family: var(--mono); font-size: .68rem; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); background: #eef3f2; }
  tbody tr:last-child td { border-bottom: none; }
  td .tool { font-family: var(--mono); font-size: .82rem; color: var(--ink); font-weight: 600; white-space: nowrap; }
  td.sc { white-space: nowrap; }

  .enums { display: grid; gap: .55rem; margin: 1rem 0; }
  .enums .er { display: grid; grid-template-columns: 120px 1fr; gap: .3rem 1rem; align-items: baseline; }
  .enums .ek { font-family: var(--mono); font-size: .78rem; color: var(--accent-deep); }
  .enums .ev { font-size: .9rem; }
  .enums .ev code { font-family: var(--mono); font-size: .8rem; background: #eef3f2; padding: .08em .34em; border-radius: 4px; color: var(--text); margin: 0 .12rem .2rem 0; display: inline-block; }
  @media (max-width: 560px) { .enums .er { grid-template-columns: 1fr; gap: .1rem; } }

  footer.doc-foot { border-top: 1px solid var(--line); padding: 2rem 0 3rem; color: var(--muted); font-size: .9rem; }
  footer.doc-foot .wrap { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; align-items: center; }
  footer.doc-foot b { color: var(--text); font-weight: 600; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>
</head>
<body>
  <div class="doc-bar">
    <span class="doc-mark">SK</span>
    <b>SPARK&nbsp;KMS</b><span class="sub">· MCP Integration</span>
    <span class="sp"></span>
    <span class="live"><span class="dot"></span>kms.paracorplabs.com</span>
  </div>

  <div class="wrap">
    <header class="hero">
      <p class="eyebrow">Integration guide · for partner teams</p>
      <h1>Query the SPARK knowledge base from your AI assistant.</h1>
      <p class="lead">SPARK KMS holds the marketing &amp; sales <b>initiatives</b>, their progress
        <b>entries</b>, and the Region&nbsp;×&nbsp;Segment <b>points leaderboard</b>. Connect over MCP
        (Claude Desktop, Claude Code, any MCP client) or plain REST, and pull it all with one API key.</p>

      <dl class="spec">
        <div class="row"><dt>MCP Endpoint</dt><dd class="big">https://kms.paracorplabs.com/api/mcp</dd></div>
        <div class="row"><dt>Transport</dt><dd>streamable HTTP</dd></div>
        <div class="row"><dt>Auth</dt><dd>Authorization: Bearer &lt;key&gt;</dd></div>
        <div class="row"><dt>Rate limit</dt><dd>60 requests / minute</dd></div>
      </dl>
    </header>

    <section class="blk">
      <div class="step-h"><span class="step-n">01</span><h2>Get an API key</h2></div>
      <div class="wrap-inner">
        <p>Keys are issued inside the app by a <b>SPARK KMS super-admin</b> (Admin&nbsp;→&nbsp;API keys).
          Ask the SPARK team to mint one for you and pick the scope:</p>
        <p><span class="pill read">read</span> &nbsp;Retrieve information only — every query tool, but
          cannot change anything. <b>This is what a partner team needs.</b></p>
        <p><span class="pill write">write</span> &nbsp;Additionally create initiatives and append entries.
          Request only if you have a reason to write into SPARK.</p>
        <div class="note tip"><span class="ic">!</span><div>Your key looks like
          <code class="inl">spark_sk_XXXXXXXX…</code> and is shown <b>only once</b>. Store it in a secret
          manager. If it leaks, the SPARK team revokes it instantly — no redeploy needed.</div></div>
      </div>
    </section>

    <section class="blk">
      <div class="step-h"><span class="step-n">02</span><h2>Connect your client</h2></div>
      <div class="wrap-inner">
        <h3>Claude Desktop / Claude Code</h3>
        <p>Desktop clients speak MCP over stdio, so bridge to the remote endpoint with
          <code class="inl">mcp-remote</code>. Add this to your MCP config
          (<code class="inl">claude_desktop_config.json</code>, or <code class="inl">.mcp.json</code> for Claude Code):</p>
        <div class="code">
          <div class="top"><span class="tl"><i></i><i></i><i></i></span><span class="fname">claude_desktop_config.json</span></div>
<pre><code>{
  <span class="k">"mcpServers"</span>: {
    <span class="k">"spark-kms"</span>: {
      <span class="k">"command"</span>: <span class="s">"npx"</span>,
      <span class="k">"args"</span>: [
        <span class="s">"-y"</span>,
        <span class="s">"mcp-remote"</span>,
        <span class="s">"https://kms.paracorplabs.com/api/mcp"</span>,
        <span class="s">"--header"</span>,
        <span class="s">"Authorization: Bearer spark_sk_YOUR_KEY_HERE"</span>
      ]
    }
  }
}</code></pre>
        </div>
        <p class="muted">Restart the client — a <b>spark-kms</b> server with 7 tools appears. Then just ask:
          <em>“Search SPARK for pop-up store initiatives”</em> or <em>“What’s the current area leaderboard?”</em></p>

        <h3>Any MCP client with a custom header</h3>
        <p>Point it at the endpoint and send the header
          <code class="inl">Authorization: Bearer &lt;your key&gt;</code>. No OAuth flow — it’s a static bearer key.</p>

        <h3>Sanity-check with curl</h3>
        <div class="code">
          <div class="top"><span class="tl"><i></i><i></i><i></i></span><span class="fname">terminal</span></div>
<pre><code><span class="c"># calls the search tool over the wire</span>
KEY=spark_sk_YOUR_KEY_HERE
curl -sN https://kms.paracorplabs.com/api/mcp \\
  -H <span class="s">"Authorization: Bearer <span class="a">$KEY</span>"</span> \\
  -H <span class="s">"Content-Type: application/json"</span> \\
  -H <span class="s">"Accept: application/json, text/event-stream"</span> \\
  -d <span class="s">'{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"search_initiatives","arguments":{"q":"popup"}}}'</span></code></pre>
        </div>
      </div>
    </section>

    <section class="blk">
      <div class="step-h"><span class="step-n">03</span><h2>Use the tools</h2></div>
      <div class="wrap-inner">
        <p>Read tools work with any key. Write tools need a <span class="pill write">write</span> key.</p>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Tool</th><th>Scope</th><th>What it returns</th></tr></thead>
            <tbody>
              <tr><td><span class="tool">search_initiatives</span></td><td class="sc"><span class="pill read">read</span></td><td>Initiatives matching a query + filters, across title, description, and entry detail. Returns rows + total.</td></tr>
              <tr><td><span class="tool">get_initiative</span></td><td class="sc"><span class="pill read">read</span></td><td>One initiative by id with its full entry timeline, action items, stage history, and per-stream points.</td></tr>
              <tr><td><span class="tool">get_top_initiatives</span></td><td class="sc"><span class="pill read">read</span></td><td>Initiatives ranked by total points — all-time or a specific week.</td></tr>
              <tr><td><span class="tool">get_leaderboard</span></td><td class="sc"><span class="pill read">read</span></td><td>The Region × Segment area leaderboard: per-stream points and totals, ranked.</td></tr>
              <tr><td><span class="tool">get_dashboard_summary</span></td><td class="sc"><span class="pill read">read</span></td><td>Counts — total initiatives, new this week, distributions by stage / pillar / region / segment.</td></tr>
              <tr><td><span class="tool">create_initiative</span></td><td class="sc"><span class="pill write">write</span></td><td>Create a new initiative plus its first progress entry.</td></tr>
              <tr><td><span class="tool">add_entry</span></td><td class="sc"><span class="pill write">write</span></td><td>Append a progress entry to an existing initiative.</td></tr>
            </tbody>
          </table>
        </div>

        <h3>Allowed values</h3>
        <div class="enums">
          <div class="er"><span class="ek">region</span><span class="ev">${codes(REGIONS)}</span></div>
          <div class="er"><span class="ek">segment</span><span class="ev">${codes(SEGMENTS)}</span></div>
          <div class="er"><span class="ek">pillar</span><span class="ev">${codes(PILLARS)}</span></div>
          <div class="er"><span class="ek">stage</span><span class="ev">${codes(STAGES)}</span></div>
          <div class="er"><span class="ek">category</span><span class="ev">${codes(CATEGORIES)}</span></div>
          <div class="er"><span class="ek">week</span><span class="ev">ISO week key like <code>2026-W27</code> (Monday-based, Asia/Jakarta). Omit for all-time.</span></div>
        </div>
      </div>
    </section>

    <section class="blk">
      <h2>Prefer plain REST?</h2>
      <div class="wrap-inner">
        <p>The same data is a normal REST API using the same keys.</p>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Resource</th><th>Link</th></tr></thead>
            <tbody>
              <tr><td>Interactive docs</td><td><a href="https://kms.paracorplabs.com/api/docs">kms.paracorplabs.com/api/docs</a></td></tr>
              <tr><td>OpenAPI 3.1 spec</td><td><a href="https://kms.paracorplabs.com/api/openapi.json">kms.paracorplabs.com/api/openapi.json</a></td></tr>
            </tbody>
          </table>
        </div>
        <div class="code">
          <div class="top"><span class="tl"><i></i><i></i><i></i></span><span class="fname">terminal</span></div>
<pre><code>curl <span class="s">"https://kms.paracorplabs.com/api/v1/initiatives?q=popup"</span> \\
  -H <span class="s">"Authorization: Bearer <span class="a">$KEY</span>"</span></code></pre>
        </div>
        <p class="muted">Read endpoints: <code class="inl">/api/v1/initiatives</code>,
          <code class="inl">/api/v1/initiatives/{id}</code>, <code class="inl">/api/v1/dashboard</code>,
          <code class="inl">/api/v1/leaderboard</code>, <code class="inl">/api/v1/top-initiatives</code>.</p>
      </div>
    </section>

    <section class="blk">
      <h2>Good to know</h2>
      <div class="wrap-inner">
        <div class="note warn"><span class="ic">▲</span><div><b>Not exposed over the API.</b> Confirming
          Best-Practice-of-the-Week, manual point awards, score adjustments, and any user or password
          management stay inside the SPARK app. A BP-of-week flag on a write is only a <em>nomination</em> —
          it never awards points until a super-admin confirms it.</div></div>

        <h3>Response codes</h3>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Code</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td><span class="tool">401</span></td><td>Missing, invalid, or revoked key.</td></tr>
              <tr><td><span class="tool">403</span></td><td>Your key lacks <code class="inl">write</code> scope for this action.</td></tr>
              <tr><td><span class="tool">409</span></td><td>A similar initiative already exists — a write returned the top candidates to reconcile (retry with <code class="inl">append_to</code> or <code class="inl">force_new</code>).</td></tr>
              <tr><td><span class="tool">429</span></td><td>You exceeded 60 requests/minute — slow down and retry.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>

  <footer class="doc-foot">
    <div class="wrap">
      <span><b>SPARK KMS</b> — Knowledge Management System</span>
      <span>·</span>
      <span>Need a key or have questions? Contact the SPARK KMS team.</span>
    </div>
  </footer>
</body>
</html>`;
