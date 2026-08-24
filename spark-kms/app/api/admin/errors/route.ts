import { NextResponse, type NextRequest } from "next/server";
import { requireSuper } from "@/src/lib/guards";
import { listRecentErrors } from "@/src/services/errors";

export const runtime = "nodejs";

/**
 * GET /api/admin/errors?limit=50 — recent captured server errors.
 *
 * Super-admin only (D30). The rows carry raw `message` and `stack`, and a
 * Postgres error routinely echoes query text and parameter values, so this is
 * the most data-revealing read in the app. proxy.ts cannot help: its matcher
 * excludes /api, so the super-only /admin page gate never reached here and this
 * guard is the whole perimeter.
 */
export async function GET(req: NextRequest) {
  const gate = await requireSuper();
  if (gate instanceof NextResponse) return gate;

  const raw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 200) : 50;

  const rows = await listRecentErrors(limit);
  return NextResponse.json({ errors: rows });
}
