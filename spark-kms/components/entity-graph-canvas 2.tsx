"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

type FGNode = { id: string; name: string; type: string };
type FGLink = { source: string; target: string; type: string };

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
}) as unknown as ComponentType<{
  width?: number;
  height?: number;
  graphData: { nodes: FGNode[]; links: FGLink[] };
  nodeRelSize?: number;
  nodeLabel?: (n: FGNode) => string;
  nodeColor?: (n: FGNode) => string;
  linkColor?: () => string;
  linkWidth?: number;
  cooldownTicks?: number;
  onNodeClick?: (n: FGNode) => void;
}>;

export const NODE_COLOR: Record<string, string> = {
  initiative: "#2563eb",
  person: "#16a34a",
  tag: "#7c3aed",
  pillar: "#d97706",
  region: "#0891b2",
  segment: "#db2777",
};

export type EntityNode = { ref: string; type: string; label: string };
export type EntityEdge = { src: string; dst: string; type: string };

/**
 * Multi-entity graph canvas (Phase 8, E7). Nodes coloured by type; clicking an
 * initiative/person/tag opens its page (dimension nodes are not linkable).
 */
export function EntityGraphCanvas({
  nodes,
  edges,
  height = 560,
}: {
  nodes: EntityNode[];
  edges: EntityEdge[];
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

  const data = useMemo(
    () => ({
      nodes: nodes.map((n) => ({ id: n.ref, name: n.label, type: n.type })),
      links: edges.map((e) => ({ source: e.src, target: e.dst, type: e.type })),
    }),
    [nodes, edges],
  );

  function open(ref: string) {
    const [type, id] = ref.split(":");
    if (type === "initiative") router.push(`/initiatives/${id}`);
    else if (type === "person") router.push(`/people/${id}`);
    else if (type === "tag") router.push(`/tags/${id}`);
    // dimension nodes (pillar/region/segment) have no dedicated page.
  }

  return (
    <div ref={wrapRef} className="overflow-hidden rounded-lg border bg-card" style={{ height }}>
      {nodes.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No nodes in this view.
        </div>
      ) : (
        <ForceGraph2D
          width={width}
          height={height}
          graphData={data}
          nodeRelSize={5}
          nodeLabel={(n) => `${n.name} (${n.type})`}
          nodeColor={(n) => NODE_COLOR[n.type] ?? "#94a3b8"}
          linkColor={() => "#cbd5e1"}
          linkWidth={1}
          cooldownTicks={80}
          onNodeClick={(n) => open(n.id)}
        />
      )}
    </div>
  );
}
