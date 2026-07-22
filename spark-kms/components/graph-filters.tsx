"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REGIONS, SEGMENTS, PILLARS } from "@/src/lib/enums";

/** Region/segment/pillar chip filters for the graph explorer (T12), URL-driven. */
export function GraphFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const current = useCallback(
    (key: string) => (params.get(key) ?? "").split(",").filter(Boolean),
    [params],
  );

  function toggle(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    const set = new Set(current(key));
    if (set.has(value)) set.delete(value);
    else set.add(value);
    if (set.size) next.set(key, [...set].join(","));
    else next.delete(key);
    router.push(next.toString() ? `${pathname}?${next.toString()}` : pathname);
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <Row label="Region" options={REGIONS} sel={current("region")} onToggle={(v) => toggle("region", v)} />
      <Row label="Segment" options={SEGMENTS} sel={current("segment")} onToggle={(v) => toggle("segment", v)} />
      <Row label="Pillar" options={PILLARS} sel={current("pillar")} onToggle={(v) => toggle("pillar", v)} />
      {params.toString().length > 0 && (
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  options,
  sel,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  sel: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 text-sm font-medium text-muted-foreground">{label}</span>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onToggle(o)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors",
            sel.includes(o)
              ? "border-foreground bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
