export const runtime = "nodejs";

/**
 * GET /api/docs — human-readable API reference (REQ-X1), rendered by Scalar from
 * /api/openapi.json. Scalar's standalone bundle is loaded from a CDN; the page
 * itself is static HTML so it has no auth requirement (the spec is public).
 */
const HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SPARK KMS API Reference</title>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/api/openapi.json"
      data-configuration='{"theme":"default","hideDownloadButton":false}'
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

export async function GET() {
  return new Response(HTML, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
