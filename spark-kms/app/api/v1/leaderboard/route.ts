import { type NextRequest } from "next/server";
import { withApiRoute } from "@/src/lib/api-auth";
import { opLeaderboard } from "@/src/services/apiOps";

export const runtime = "nodejs";

/** GET /api/v1/leaderboard?week=YYYY-Www — Region×Segment ranking (read scope). */
export async function GET(req: NextRequest) {
  return withApiRoute(req, async (ctx) => {
    const week = req.nextUrl.searchParams.get("week") ?? undefined;
    return { body: await opLeaderboard(ctx, week) };
  });
}
