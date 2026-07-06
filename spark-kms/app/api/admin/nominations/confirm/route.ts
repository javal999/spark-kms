import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSuper } from "@/src/lib/guards";
import { confirmBpOfWeek } from "@/src/services/admin";

export const runtime = "nodejs";

const schema = z.object({ entryId: z.number().int() });

/** POST /api/admin/nominations/confirm — confirm a nomination → +2 (super only). */
export async function POST(req: NextRequest) {
  const gate = await requireSuper();
  if (gate instanceof NextResponse) return gate;

  let entryId: number;
  try {
    entryId = schema.parse(await req.json()).entryId;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await confirmBpOfWeek(entryId, gate.userId!);
  if (result.status === "not-found") {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
  if (result.status === "not-nominated") {
    return NextResponse.json({ error: "That entry was not nominated" }, { status: 400 });
  }
  return NextResponse.json(result);
}
