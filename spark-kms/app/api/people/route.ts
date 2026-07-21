import { NextResponse, type NextRequest } from "next/server";
import { requireViewer } from "@/src/lib/guards";
import { searchPeople } from "@/src/services/people";

export const runtime = "nodejs";

/** GET /api/people?q= — active PIC directory names for the picker autocomplete. */
export async function GET(req: NextRequest) {
  const gate = await requireViewer();
  if (gate instanceof NextResponse) return gate;
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  return NextResponse.json({ people: await searchPeople(q) });
}
