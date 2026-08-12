import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/src/lib/guards";
import { archiveInitiative, restoreInitiative } from "@/src/services/initiatives";

export const runtime = "nodejs";

/** POST /api/initiatives/[id]/archive — soft-archive an initiative (admin+). */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;
  const iid = Number(id);
  if (!Number.isInteger(iid)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  await archiveInitiative(iid, gate.userId!);
  return NextResponse.json({ ok: true, archived: true });
}

/** DELETE /api/initiatives/[id]/archive — restore an archived initiative (admin+). */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;
  const iid = Number(id);
  if (!Number.isInteger(iid)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  await restoreInitiative(iid);
  return NextResponse.json({ ok: true, archived: false });
}
