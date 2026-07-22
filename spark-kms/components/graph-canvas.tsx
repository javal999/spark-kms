"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

type FGNode = { id: number; name: string; sub: string; orphan: boolean };
type FGLink = { source: number; target: number; type: string };

// react-force-graph uses canvas + window, so it must be client-only (no SSR).
// Cast to the subset of props we use — the lib's own generics are heavy.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
}) as unknown as ComponentType<{
  width?: number;
  height?: number;
  graphData: { nodes: FGNode[]; links: FGLink[] };
  nodeRelSize?: number;
  nodeLabel?: (n: FGNode) => string;
  nodeColor?: (n: FGNode) => string;
  linkColor?: (l: FGLink) => string;
  linkWidth?: number;
  linkDirectionalParticles?: number;
  cooldownTicks?: number;
  onNodeClick?: (n: FGNode) => void;
}>;

export type GraphNodeInput = {
  id: number;
  title: string;
  region: string;
  segment: string;
  pillar: string;
  stage: string;
};
export type GraphEdgeInput = { srcId: number; dstId: number; type: string };

const EDGE_COLOR: Record<string, string> = {
  explicit: "#2563eb",
  replicated_from: "#0891b2",
  co_tag: "#94a3b8",
};

/**
 * Force-directed graph of initiatives (T11 ego graph, T12 explorer). Nodes are
 * initiatives; clicking one opens its detail page. Orphans (no edges) are
 * highlighted. Sized to its container; empty state when there are no nodes.
 */
export function GraphCanvas({
  nodes,
  edges,
  orphanIds = [],
  height = 420,
}: {
  nodes: GraphNodeInput[];
  edges: GraphEdgeInput[];
  orphanIds?: number[];
  height?: number;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const orphanSet = useMemo(() => new Set(orphanIds), [orphanIds]);
  const data = useMemo(
    () => ({
      nodes: nodes.map((n) => ({
        id: n.id,
        name: n.title,
        sub: `${n.region} · ${n.segment}`,
        orphan: orphanSet.has(n.id),
      })),
      links: edges.map((e) => ({ source: e.srcId, target: e.dstId, type: e.type })),
    }),
    [nodes, edges, orphanSet],
  );

  return (
    <div ref={wrapRef} className="overflow-hidden rounded-lg border bg-card" style={{ height }}>
      {nodes.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No initiatives to graph in this view.
        </div>
      ) : (
        <ForceGraph2D
          width={width}
          height={height}
          graphData={data}
          nodeRelSize={5}
          nodeLabel={(n: { name: string; sub: string }) => `${n.name} — ${n.sub}`}
          nodeColor={(n: { orphan: boolean }) => (n.orphan ? "#f59e0b" : "#2563eb")}
          linkColor={(l: { type: string }) => EDGE_COLOR[l.type] ?? "#cbd5e1"}
          linkWidth={1}
          linkDirectionalParticles={0}
          cooldownTicks={80}
          onNodeClick={(n: { id: number }) => router.push(`/initiatives/${n.id}`)}
        />
      )}
    </div>
  );
}
