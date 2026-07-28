import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/src/lib/guards";
import { listRecentErrors } from "@/src/services/errors";

export const runtime = "nodejs";

/** GET /api/admin/errors?limit=50 — recent captured server errors (admin only). */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const raw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 200) : 50;

  const rows = await listRecentErrors(limit);
  return NextResponse.json({ errors: rows });
}
