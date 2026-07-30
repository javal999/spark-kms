import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/src/lib/guards";
import { captureError, serverErrorResponse, logSlowRequest } from "@/src/lib/error-log";
import { previewUpload, UploadError, MAX_UPLOAD_BYTES } from "@/src/services/upload";

export const runtime = "nodejs";

/** POST /api/upload/preview — dry-run validation + duplicate candidates. */
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

  const startedAt = Date.now();
  try {
    const result = await previewUpload(buffer, file.name, gate.userId!);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status });
    }
    const traceId = await captureError(err, {
      route: "POST /api/upload/preview",
      actorId: gate.userId,
      meta: { fileBytes: file.size },
    });
    return serverErrorResponse(traceId);
  } finally {
    logSlowRequest("POST /api/upload/preview", startedAt, { fileBytes: file.size });
  }
}
