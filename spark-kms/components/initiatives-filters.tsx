"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REGIONS, SEGMENTS, PILLARS, STAGES, CATEGORIES } from "@/src/lib/enums";

// v1.2 (item 12): action-items-done buckets. "—" (0 items) is excluded.
const DONE_BUCKETS: { value: string; label: string }[] = [
  { value: "0", label: "Not started" },
  { value: "partial", label: "In progress" },
  { value: "100", label: "Complete" },
];

// Keys that live inside the collapsible panel — used to count active filters.
const PANEL_KEYS = ["region", "segment", "pillar", "stage", "category", "done"];

/**
 * URL-encoded, deep-linkable filter state (REQ page 4). Every change rewrites
 * the query string; the server component re-reads it. Multi-value filters are
 * comma-joined. v1.2 (item 13): the chip rows collapse behind a "Filters"
 * toggle so the default view is just search; the panel auto-opens when a
 * deep-link arrives with any panel filter already set.
 */
export function InitiativesFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const current = useCallback(
    (key: string) => (params.get(key) ?? "").split(",").filter(Boolean),
    [params],
  );

  const activeCount = PANEL_KEYS.reduce(
    (n, k) => n + (params.get(k) ? 1 : 0),
    0,
  );
  const [open, setOpen] = useState(activeCount > 0);

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
  const done = params.get("done") ?? "";

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
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          data-testid="toggle-filters"
          aria-expanded={open}
        >
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
          <span aria-hidden className="ml-1">
            {open ? "▲" : "▼"}
          </span>
        </Button>
        {params.toString().length > 0 && (
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

      {open && (
        <div className="flex flex-col gap-4 border-t pt-4">
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

          <div className="flex flex-wrap items-center gap-2">
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

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-sm font-medium text-muted-foreground">
              Actions
            </span>
            {DONE_BUCKETS.map((b) => (
              <Chip
                key={b.value}
                active={done === b.value}
                onClick={() =>
                  setSingle("done", done === b.value ? null : b.value)
                }
              >
                {b.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
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
