import { type NextRequest } from "next/server";
import { withApiRoute } from "@/src/lib/api-auth";
import { opTopInitiatives } from "@/src/services/apiOps";

export const runtime = "nodejs";

/** GET /api/v1/top-initiatives?week=YYYY-Www&limit=10 — ranked (read scope). */
export async function GET(req: NextRequest) {
  return withApiRoute(req, async (ctx) => {
    const sp = req.nextUrl.searchParams;
    const week = sp.get("week") ?? undefined;
    const limitRaw = sp.get("limit");
    const limit = limitRaw == null || limitRaw === "" ? undefined : Number(limitRaw);
    return { body: await opTopInitiatives(ctx, week, limit) };
  });
}
