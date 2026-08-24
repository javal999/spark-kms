"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PERIOD_PARAM,
  KEY_PARAM,
  LEGACY_PARAM,
  type PeriodType,
} from "@/src/lib/period";

/**
 * Two-level, URL-driven period picker for Top Initiatives (D27).
 *
 * Level 1 chooses Weekly / Monthly / All-time; level 2 chooses which week or
 * which month and is absent for All-time rather than present and disabled.
 * Writes `?topperiod=` and `?topkey=`, and drops the pre-D27 `?topweek=` on any
 * interaction so the two forms never both describe the URL. Server components
 * re-read the params.
 *
 * The leaderboards keep the single-level WeekSelector.
 */
const TYPE_LABELS: Record<PeriodType, string> = {
  week: "Weekly",
  month: "Monthly",
  all: "All-time",
};

export function PeriodSelector({
  type,
  periodKey,
  weeks,
  months,
  defaultKey,
}: {
  type: PeriodType;
  /** Selected week or month key. Absent for all-time. */
  periodKey?: string;
  weeks: { key: string; label: string }[];
  months: { key: string; label: string }[];
  /** The week shown when the URL carries no period params at all. */
  defaultKey: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function push(next: URLSearchParams) {
    next.delete(LEGACY_PARAM);
    router.push(next.toString() ? `${pathname}?${next.toString()}` : pathname);
  }

  function changeType(value: string | null) {
    if (!value) return;
    const next = new URLSearchParams(search.toString());
    next.delete(KEY_PARAM); // level 2 re-defaults to the most recent one
    // The default view is the current week, so express it as a clean URL.
    if (value === "week") next.delete(PERIOD_PARAM);
    else next.set(PERIOD_PARAM, value);
    push(next);
  }

  function changeKey(value: string | null) {
    if (!value) return;
    const next = new URLSearchParams(search.toString());
    next.set(PERIOD_PARAM, type);
    if (type === "week" && value === defaultKey) {
      next.delete(PERIOD_PARAM);
      next.delete(KEY_PARAM);
    } else {
      next.set(KEY_PARAM, value);
    }
    push(next);
  }

  const options = type === "month" ? months : weeks;
  // Base UI renders the raw value unless the label is formatted here.
  const keyLabel = (value: unknown) =>
    options.find((o) => o.key === value)?.label ?? String(value ?? "");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={type} onValueChange={changeType}>
        <SelectTrigger className="w-32" data-testid="period-type">
          <SelectValue>
            {(value: unknown) => TYPE_LABELS[value as PeriodType] ?? ""}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="week">{TYPE_LABELS.week}</SelectItem>
          <SelectItem value="month">{TYPE_LABELS.month}</SelectItem>
          <SelectItem value="all">{TYPE_LABELS.all}</SelectItem>
        </SelectContent>
      </Select>

      {type !== "all" && (
        <Select value={periodKey} onValueChange={changeKey}>
          <SelectTrigger className="w-52" data-testid="period-key">
            <SelectValue>{keyLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
