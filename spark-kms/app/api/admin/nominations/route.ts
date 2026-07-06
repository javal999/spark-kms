import { NextResponse } from "next/server";
import { requireSuper } from "@/src/lib/guards";
import { listPendingNominations } from "@/src/services/admin";

export const runtime = "nodejs";

/** GET /api/admin/nominations — pending BP-of-week nominations (super only). */
export async function GET() {
  const gate = await requireSuper();
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json({ nominations: await listPendingNominations() });
}
