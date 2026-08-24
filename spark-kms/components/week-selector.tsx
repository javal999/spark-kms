"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "all-time";
const ALL_LABEL = "All-time";

/**
 * URL-driven week picker (All-time + recent weeks). Writes `?<param>=YYYY-Www`
 * or removes it for all-time. Server components re-read the param.
 */
export function WeekSelector({
  param = "week",
  weeks,
  defaultValue = ALL,
}: {
  param?: string;
  weeks: { key: string; label: string }[];
  /** Selection shown when the URL param is absent (default: All-time). */
  defaultValue?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const current = search.get(param) ?? defaultValue;

  function change(value: string | null) {
    if (!value) return;
    const next = new URLSearchParams(search.toString());
    // Drop the param only for the default selection (clean URL). Any other
    // choice — including All-time when the default is a specific week — is set
    // explicitly, so "All-time" stays reachable on pages that default to a week.
    if (value === defaultValue) next.delete(param);
    else next.set(param, value);
    router.push(next.toString() ? `${pathname}?${next.toString()}` : pathname);
  }

  // Base UI renders the raw value unless the label is formatted here, which is
  // why the trigger used to read "all-time" and "2026-W35".
  const label = (value: unknown) =>
    value === ALL
      ? ALL_LABEL
      : (weeks.find((w) => w.key === value)?.label ?? String(value ?? ""));

  return (
    <Select value={current} onValueChange={change}>
      <SelectTrigger className="w-56" data-testid="week-selector">
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{ALL_LABEL}</SelectItem>
        {weeks.map((w) => (
          <SelectItem key={w.key} value={w.key}>
            {w.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
