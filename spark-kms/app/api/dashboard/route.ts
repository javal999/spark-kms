import { NextResponse } from "next/server";
import { requireViewer } from "@/src/lib/guards";
import { dashboardStats } from "@/src/services/scores";

export const runtime = "nodejs";

/** GET /api/dashboard — counters, stage summary, distributions, category split. */
export async function GET() {
  const gate = await requireViewer();
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json(await dashboardStats());
}
