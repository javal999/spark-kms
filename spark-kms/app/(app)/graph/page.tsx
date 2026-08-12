import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { flags } from "@/src/lib/flags";
import { readSession } from "@/src/lib/session";
import { isSuper } from "@/src/lib/session-config";
import { buildEntityGraph, type NodeType } from "@/src/services/graph";
import { EntityGraphCanvas, NODE_COLOR } from "@/components/entity-graph-canvas";
import { GraphFilters } from "@/components/graph-filters";

type SP = Record<string, string | string[] | undefined>;
const NODE_TYPES: NodeType[] = ["initiative", "person", "tag", "pillar", "region", "segment"];
const list = (v: string | string[] | undefined): string[] | undefined => {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s.split(",").filter(Boolean) : undefined;
};

/**
 * Entity-graph explorer (Phase 8, E7). Viewer-facing, flag-gated. Nodes are
 * initiatives, people, tags, and the pillar/region/segment dimensions —
 * coloured by type, filterable by type + region/segment/pillar; click a
 * node to open it.
 */
export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  if (!flags.graph) notFound();
  // Super-admin only (defence-in-depth; the nav also hides it below super).
  if (!isSuper((await readSession()).role)) redirect("/");
  const sp = await searchParams;
  const rawTypes = list(sp.types);
  const types = rawTypes?.filter((t): t is NodeType => NODE_TYPES.includes(t as NodeType));

  const { nodes, edges } = await buildEntityGraph({
    region: list(sp.region),
    segment: list(sp.segment),
    pillar: list(sp.pillar),
    types: types?.length ? types : undefined,
  });

  const counts = NODE_TYPES.map((t) => ({ t, n: nodes.filter((x) => x.type === t).length })).filter(
    (c) => c.n > 0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge graph</h1>
          <p className="text-sm text-muted-foreground">
            Initiatives, people, and themes — how the knowledge connects. Click a node to open it.
          </p>
          {flags.tracking && (
            <Link
              href="/insights"
              className="mt-1 inline-block text-sm text-primary hover:underline"
            >
              Usage insights →
            </Link>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {nodes.length} nodes · {edges.length} edges
        </div>
      </div>

      <GraphFilters />

      <EntityGraphCanvas nodes={nodes} edges={edges} height={560} />

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {counts.map((c) => (
          <span key={c.t} className="inline-flex items-center gap-1.5 capitalize">
            <span className="inline-block size-2.5 rounded-full" style={{ background: NODE_COLOR[c.t] }} />
            {c.t} ({c.n})
          </span>
        ))}
      </div>
    </div>
  );
}
