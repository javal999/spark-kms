import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSuper } from "@/src/lib/guards";
import { regionEnum, segmentEnum } from "@/src/db/schema";
import { isoDateSchema } from "@/src/validation/entry";
import { logManualStream } from "@/src/services/admin";

export const runtime = "nodejs";

const schema = z.object({
  region: z.enum(regionEnum.enumValues),
  segment: z.enum(segmentEnum.enumValues),
  stream: z.enum(["presentation", "cee_participation", "cee_best"]),
  effectiveDate: isoDateSchema,
});

/** POST /api/admin/scoring — log a manual weekly stream (super only). Returns
 * `{status:'skipped'}` when a cap (presenter 1/area/week) blocks it. */
export async function POST(req: NextRequest) {
  const gate = await requireSuper();
  if (gate instanceof NextResponse) return gate;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await logManualStream(body, gate.userId!);
  return NextResponse.json(result);
}
