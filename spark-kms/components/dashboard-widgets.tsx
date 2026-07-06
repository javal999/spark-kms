import Link from "next/link";
import { cn } from "@/lib/utils";

/** A single clickable metric. The number is never a dead end (council finding). */
export function StatCard({
  label,
  value,
  href,
  hint,
  emphasis,
}: {
  label: string;
  value: number;
  href: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col rounded-lg border bg-card p-4 transition-colors hover:border-foreground/30",
        emphasis && "border-primary/30 bg-primary/[0.03]",
      )}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
        {value}
      </span>
      {hint && <span className="mt-1 text-xs text-muted-foreground">{hint}</span>}
    </Link>
  );
}

/** Horizontal clickable distribution — every slice deep-links to the list. */
export function DistributionBars({
  title,
  data,
  hrefFor,
}: {
  title: string;
  data: Record<string, number>;
  hrefFor: (key: string) => string;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="flex flex-col gap-1.5">
        {entries.length === 0 && (
          <span className="text-sm text-muted-foreground">No data yet.</span>
        )}
        {entries.map(([key, value]) => (
          <Link
            key={key}
            href={hrefFor(key)}
            className="group grid grid-cols-[9rem_1fr_2rem] items-center gap-3 rounded px-1 py-0.5 text-sm hover:bg-muted"
          >
            <span className="truncate text-foreground/80">{key}</span>
            <span className="h-2 rounded-full bg-muted">
              <span
                className="block h-2 rounded-full bg-primary/70 group-hover:bg-primary"
                style={{ width: `${(value / max) * 100}%` }}
              />
            </span>
            <span className="text-right tabular-nums text-muted-foreground">
              {value}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
