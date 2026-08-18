import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/lib/guards";
import { regionEnum, segmentEnum, scoreStreamEnum } from "@/src/db/schema";
import { isoDateSchema } from "@/src/validation/entry";
import { postAdjustment } from "@/src/services/admin";

export const runtime = "nodejs";

const schema = z.object({
  region: z.enum(regionEnum.enumValues),
  segment: z.enum(segmentEnum.enumValues),
  stream: z.enum(scoreStreamEnum.enumValues),
  points: z.number().int().refine((n) => n !== 0, "Points can't be zero"),
  effectiveDate: isoDateSchema,
  note: z.string().trim().min(1, "A note is required"),
  initiativeId: z.number().int().optional(),
});

/**
 * POST /api/admin/adjustment — manual adjustment with a mandatory note.
 * Open to any admin since D24 (was super-admin only, REQ-S3). The note and
 * `created_by` are the audit trail; the edit log shows who posted what.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    const msg =
      (err as z.ZodError).issues?.[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const result = await postAdjustment(body, gate.userId!);
  return NextResponse.json(result, { status: 201 });
}
