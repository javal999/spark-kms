import { notFound } from "next/navigation";
import { flags } from "@/src/lib/flags";
import { buildGraph } from "@/src/services/links";
import { GraphCanvas } from "@/components/graph-canvas";
import { GraphFilters } from "@/components/graph-filters";

type SP = Record<string, string | string[] | undefined>;
const list = (v: string | string[] | undefined): string[] | undefined => {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s.split(",").filter(Boolean) : undefined;
};

/**
 * Global graph explorer (Phase 7, T12). Viewer-facing, flag-gated. Nodes are
 * initiatives filterable by region/segment/pillar; orphans (no edges in view)
 * are highlighted amber; clicking a node opens its detail page.
 */
export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  if (!flags.graph) notFound();
  const sp = await searchParams;
  const { nodes, edges } = await buildGraph({
    region: list(sp.region),
    segment: list(sp.segment),
    pillar: list(sp.pillar),
  });

  // Orphans within the current view: nodes touched by no edge in the filtered set.
  const connected = new Set<number>();
  for (const e of edges) {
    connected.add(e.srcId);
    connected.add(e.dstId);
  }
  const orphanIds = nodes.filter((n) => !connected.has(n.id)).map((n) => n.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Initiative graph</h1>
          <p className="text-sm text-muted-foreground">
            How initiatives connect. Click a node to open it.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{nodes.length} nodes</span>
          <span>{edges.length} edges</span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full" style={{ background: "#f59e0b" }} />
            {orphanIds.length} orphan{orphanIds.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <GraphFilters />

      <GraphCanvas nodes={nodes} edges={edges} orphanIds={orphanIds} height={560} />

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <Legend color="#2563eb" label="Explicit link" />
        <Legend color="#0891b2" label="Replicated from" />
        <Legend color="#94a3b8" label="Shared tags" />
        <Legend color="#f59e0b" label="Orphan (no links)" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-1 w-4 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
