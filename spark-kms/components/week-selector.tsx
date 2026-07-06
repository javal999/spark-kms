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

/**
 * URL-driven week picker (All-time + recent weeks). Writes `?<param>=YYYY-Www`
 * or removes it for all-time. Server components re-read the param.
 */
export function WeekSelector({
  param = "week",
  weeks,
}: {
  param?: string;
  weeks: { key: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const current = search.get(param) ?? ALL;

  function change(value: string | null) {
    if (!value) return;
    const next = new URLSearchParams(search.toString());
    if (value === ALL) next.delete(param);
    else next.set(param, value);
    router.push(next.toString() ? `${pathname}?${next.toString()}` : pathname);
  }

  return (
    <Select value={current} onValueChange={change}>
      <SelectTrigger className="w-56" data-testid="week-selector">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All-time</SelectItem>
        {weeks.map((w) => (
          <SelectItem key={w.key} value={w.key}>
            {w.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
