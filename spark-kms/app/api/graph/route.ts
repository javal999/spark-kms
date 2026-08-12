import { NextResponse, type NextRequest } from "next/server";
import { requireSuper } from "@/src/lib/guards";
import { flags } from "@/src/lib/flags";
import { buildEntityGraph, type NodeType } from "@/src/services/graph";

export const runtime = "nodejs";

const NODE_TYPES: NodeType[] = ["initiative", "person", "tag", "pillar", "region", "segment"];
const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : undefined);

/**
 * GET /api/graph (E6) — the multi-entity knowledge graph: typed nodes + edges,
 * filterable by region/segment/pillar and by node `types` (super-admin only,
 * flag-gated).
 */
export async function GET(req: NextRequest) {
  if (!flags.graph) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = await requireSuper();
  if (gate instanceof NextResponse) return gate;

  const sp = req.nextUrl.searchParams;
  const rawTypes = list(sp.get("types"));
  const types = rawTypes?.filter((t): t is NodeType => NODE_TYPES.includes(t as NodeType));

  const graph = await buildEntityGraph({
    region: list(sp.get("region")),
    segment: list(sp.get("segment")),
    pillar: list(sp.get("pillar")),
    types: types?.length ? types : undefined,
  });
  return NextResponse.json(graph);
}
