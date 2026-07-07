import { type NextRequest } from "next/server";
import { withApiRoute } from "@/src/lib/api-auth";
import { opDashboard } from "@/src/services/apiOps";

export const runtime = "nodejs";

/** GET /api/v1/dashboard — initiative counters + distributions (read scope). */
export async function GET(req: NextRequest) {
  return withApiRoute(req, async (ctx) => ({ body: await opDashboard(ctx) }));
}
