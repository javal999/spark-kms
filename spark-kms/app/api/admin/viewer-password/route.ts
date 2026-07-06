import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSuper } from "@/src/lib/guards";
import { rotateViewerPassword } from "@/src/services/admin";

export const runtime = "nodejs";

const schema = z.object({ password: z.string().min(8) });

/** POST /api/admin/viewer-password — rotate + log out all viewer sessions. */
export async function POST(req: NextRequest) {
  const gate = await requireSuper();
  if (gate instanceof NextResponse) return gate;

  let password: string;
  try {
    password = schema.parse(await req.json()).password;
  } catch {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  const epoch = await rotateViewerPassword(password);
  return NextResponse.json({ ok: true, epoch });
}
