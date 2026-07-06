import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdmin, requireViewer } from "@/src/lib/guards";
import { db } from "@/src/db";
import { initiatives } from "@/src/db/schema";
import { stageSchema } from "@/src/validation/entry";
import { changeStage, getInitiativeDetail } from "@/src/services/initiatives";

export const runtime = "nodejs";

/** GET /api/initiatives/[id] — full detail (viewer). */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireViewer();
  if (gate instanceof NextResponse) return gate;

  const { id } = await ctx.params;
  const detail = await getInitiativeDetail(Number(id));
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
}

const patchSchema = z.object({
  stage: stageSchema.optional(),
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  pic: z.string().trim().min(1).optional(),
  linkUrl: z.string().trim().optional(),
});

/** PATCH /api/initiatives/[id] — edit fields; stage change logs stage_changes. */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { id } = await ctx.params;
  const initiativeId = Number(id);
  if (!Number.isInteger(initiativeId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Validation failed", details: (err as z.ZodError).issues },
      { status: 400 },
    );
  }

  // Stage changes go through the service so stage_changes is always logged.
  if (body.stage) {
    await changeStage(initiativeId, body.stage, gate.userId!);
  }

  const fields: Partial<typeof initiatives.$inferInsert> = {};
  if (body.title !== undefined) fields.title = body.title;
  if (body.description !== undefined) fields.description = body.description;
  if (body.pic !== undefined) fields.pic = body.pic;
  if (body.linkUrl !== undefined) fields.linkUrl = body.linkUrl;

  if (Object.keys(fields).length > 0) {
    fields.updatedAt = new Date();
    await db
      .update(initiatives)
      .set(fields)
      .where(eq(initiatives.id, initiativeId));
  }

  return NextResponse.json({ ok: true });
}
