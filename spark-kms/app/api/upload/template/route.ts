import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/guards";
import { generateTemplate, getTemplateVersion } from "@/src/services/template";

export const runtime = "nodejs";

/** GET /api/upload/template — streams the generated, versioned .xlsx (admin). */
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const version = await getTemplateVersion();
  const buffer = await generateTemplate();

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="SPARK-KMS-Upload-Template-${version}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
