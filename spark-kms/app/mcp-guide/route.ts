import { MCP_GUIDE_HTML } from "@/src/lib/mcp-guide-html";

export const runtime = "nodejs";

/**
 * GET /mcp-guide — the partner-team MCP/REST integration guide. Public (the
 * proxy allowlists this path) and intentionally NOT linked in the app nav, so
 * it's reachable only via a shared direct link.
 */
export async function GET() {
  return new Response(MCP_GUIDE_HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
