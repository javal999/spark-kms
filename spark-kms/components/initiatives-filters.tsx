"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REGIONS, SEGMENTS, PILLARS, STAGES, CATEGORIES } from "@/src/lib/enums";

/**
 * URL-encoded, deep-linkable filter state (REQ page 4). Every change rewrites
 * the query string; the server component re-reads it. Multi-value filters are
 * comma-joined.
 */
export function InitiativesFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const current = useCallback(
    (key: string) => (params.get(key) ?? "").split(",").filter(Boolean),
    [params],
  );

  function commit(next: URLSearchParams) {
    next.delete("page"); // reset to page 1 on any filter change
    router.push(`${pathname}?${next.toString()}`);
  }

  function toggleMulti(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    const set = new Set(current(key));
    if (set.has(value)) set.delete(value);
    else set.add(value);
    if (set.size) next.set(key, [...set].join(","));
    else next.delete(key);
    commit(next);
  }

  function setSingle(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    commit(next);
  }

  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          defaultValue={q}
          placeholder="Search title, description, entry detail…"
          data-testid="search"
          className="max-w-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setSingle("q", (e.target as HTMLInputElement).value || null);
            }
          }}
          onBlur={(e) => setSingle("q", e.target.value || null)}
        />
        {(params.toString().length > 0) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(pathname)}
            data-testid="clear-filters"
          >
            Clear all
          </Button>
        )}
      </div>

      <FilterRow
        label="Region"
        options={REGIONS}
        selected={current("region")}
        onToggle={(v) => toggleMulti("region", v)}
      />
      <FilterRow
        label="Segment"
        options={SEGMENTS}
        selected={current("segment")}
        onToggle={(v) => toggleMulti("segment", v)}
      />
      <FilterRow
        label="Pillar"
        options={PILLARS}
        selected={current("pillar")}
        onToggle={(v) => toggleMulti("pillar", v)}
      />
      <FilterRow
        label="Stage"
        options={STAGES}
        selected={current("stage")}
        onToggle={(v) => toggleMulti("stage", v)}
      />

      <div className="flex items-center gap-2">
        <span className="w-16 text-sm font-medium text-muted-foreground">
          Has
        </span>
        {CATEGORIES.map((c) => (
          <Chip
            key={c}
            active={category === c}
            onClick={() => setSingle("category", category === c ? null : c)}
          >
            {c}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function FilterRow({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 text-sm font-medium text-muted-foreground">
        {label}
      </span>
      {options.map((o) => (
        <Chip key={o} active={selected.includes(o)} onClick={() => onToggle(o)}>
          {o}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
