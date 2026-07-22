import { NextResponse, type NextRequest } from "next/server";
import { requireViewer } from "@/src/lib/guards";
import { flags } from "@/src/lib/flags";
import { buildGraph } from "@/src/services/links";

export const runtime = "nodejs";

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : undefined);

/** GET /api/graph (T9) — nodes + edges, filterable by region/segment/pillar (viewer). */
export async function GET(req: NextRequest) {
  if (!flags.graph) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = await requireViewer();
  if (gate instanceof NextResponse) return gate;

  const sp = req.nextUrl.searchParams;
  const graph = await buildGraph({
    region: list(sp.get("region")),
    segment: list(sp.get("segment")),
    pillar: list(sp.get("pillar")),
  });
  return NextResponse.json(graph);
}
