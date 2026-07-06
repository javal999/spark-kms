import { NextResponse, type NextRequest } from "next/server";
import { requireViewer } from "@/src/lib/guards";
import { areaLeaderboard } from "@/src/services/scores";

export const runtime = "nodejs";

/** GET /api/leaderboard?week=YYYY-Www — per-area stream sums, ranked. */
export async function GET(req: NextRequest) {
  const gate = await requireViewer();
  if (gate instanceof NextResponse) return gate;
  const week = req.nextUrl.searchParams.get("week") ?? undefined;
  return NextResponse.json({ rows: await areaLeaderboard(week) });
}
