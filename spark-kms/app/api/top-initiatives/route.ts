import { NextResponse, type NextRequest } from "next/server";
import { requireViewer } from "@/src/lib/guards";
import { topInitiatives } from "@/src/services/scores";

export const runtime = "nodejs";

/** GET /api/top-initiatives?week=YYYY-Www — initiatives ranked by score SUM. */
export async function GET(req: NextRequest) {
  const gate = await requireViewer();
  if (gate instanceof NextResponse) return gate;
  const week = req.nextUrl.searchParams.get("week") ?? undefined;
  // The API contract stays week-keyed; the period filter added in D27 is a
  // dashboard control, not a change to this endpoint.
  return NextResponse.json({
    rows: await topInitiatives(week ? { kind: "week", key: week } : undefined),
  });
}
