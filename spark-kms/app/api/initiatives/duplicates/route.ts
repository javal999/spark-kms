import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/lib/guards";
import { findDuplicateCandidates } from "@/src/services/duplicates";

export const runtime = "nodejs";

const schema = z.object({ title: z.string().min(1) });

/** POST /api/initiatives/duplicates → top-3 similar-theme candidates (REQ-D2). */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  let title: string;
  try {
    title = schema.parse(await req.json()).title;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const candidates = await findDuplicateCandidates(title);
  return NextResponse.json({ candidates });
}
