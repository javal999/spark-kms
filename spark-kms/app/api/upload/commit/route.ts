import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/lib/guards";
import { captureError, serverErrorResponse } from "@/src/lib/error-log";
import {
  commitUpload,
  UploadError,
  MAX_UPLOAD_BYTES,
  type RowChoice,
} from "@/src/services/upload";

export const runtime = "nodejs";

const choiceSchema = z.record(
  z.string(),
  z.object({
    action: z.enum(["new", "append"]),
    initiativeId: z.number().int().optional(),
  }),
);

/** POST /api/upload/commit — all-or-nothing commit of a previewed file. */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  let choices: Record<number, RowChoice> = {};
  const rawChoices = form.get("choices");
  if (typeof rawChoices === "string" && rawChoices.length > 0) {
    const parsed = choiceSchema.safeParse(JSON.parse(rawChoices));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid choices" }, { status: 400 });
    }
    choices = Object.fromEntries(
      Object.entries(parsed.data).map(([k, v]) => [Number(k), v]),
    );
  }

  try {
    const result = await commitUpload(buffer, choices, gate.userId!);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status });
    }
    // Unexpected failure (DB write, scoring, timeout) — previously vanished as a
    // bare 500. Capture it with batch context and hand the user a trace id.
    const traceId = await captureError(err, {
      route: "POST /api/upload/commit",
      actorId: gate.userId,
      meta: { fileBytes: file.size, choiceCount: Object.keys(choices).length },
    });
    return serverErrorResponse(traceId);
  }
}
