import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin, requireViewer } from "@/src/lib/guards";
import { flags } from "@/src/lib/flags";
import {
  relatedInitiatives,
  createExplicitLink,
  deleteExplicitBetween,
  SelfLinkError,
  DuplicateLinkError,
} from "@/src/services/links";

export const runtime = "nodejs";

/** GET /api/initiatives/[id]/links (T9) — related initiatives for the panel (viewer). */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!flags.graph) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = await requireViewer();
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;
  return NextResponse.json({ related: await relatedInitiatives(Number(id)) });
}

const bodySchema = z.object({ targetId: z.number().int().positive() });

/** POST /api/initiatives/[id]/links — create an explicit edge id→target (admin). */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!flags.graph) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const linkId = await createExplicitLink(Number(id), body.targetId, gate.userId!);
    return NextResponse.json({ id: linkId }, { status: 201 });
  } catch (err) {
    if (err instanceof SelfLinkError)
      return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof DuplicateLinkError)
      return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
}

/** DELETE /api/initiatives/[id]/links — remove the explicit edge to target (admin). */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!flags.graph) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  await deleteExplicitBetween(Number(id), body.targetId);
  return NextResponse.json({ ok: true });
}
