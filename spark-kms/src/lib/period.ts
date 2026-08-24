import {
  currentWeekOf,
  monthOf,
  type Period,
} from "@/src/services/week";

/**
 * URL-parameter mapping for the dashboard's Top Initiatives period filter (D27).
 *
 * Two levels: `topperiod` picks week / month / all-time, `topkey` picks which
 * one. Pure and server-read, so a selection is shareable and survives a reload.
 * The date arithmetic itself stays in src/services/week.ts — this module only
 * decides WHICH period the query string is asking for.
 */

export const PERIOD_PARAM = "topperiod";
export const KEY_PARAM = "topkey";
/** Pre-D27 single-parameter form. Links carrying it are already in circulation. */
export const LEGACY_PARAM = "topweek";
export const LEGACY_ALL = "all-time";

export type PeriodType = "week" | "month" | "all";

export type PeriodSelection = {
  type: PeriodType;
  /** The selected week or month key. Absent for all-time. */
  key?: string;
  /** What the read services take. `undefined` means all-time. */
  period?: Period;
};

const WEEK_KEY = /^\d{4}-W\d{2}$/;
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isWeekKey(value: string): boolean {
  return WEEK_KEY.test(value);
}

export function isMonthKey(value: string): boolean {
  return MONTH_KEY.test(value);
}

/**
 * Resolve the query string into a period. Unknown or malformed values fall back
 * to the most recent period of the requested type rather than erroring, because
 * these values arrive from a URL anybody can hand-edit.
 */
export function resolvePeriod(
  params: { period?: string; key?: string; legacyWeek?: string },
  now: Date = new Date(),
): PeriodSelection {
  const { period, key, legacyWeek } = params;

  if (period === "all") return { type: "all" };

  if (period === "month") {
    const k = key && isMonthKey(key) ? key : monthOf(now);
    return { type: "month", key: k, period: { kind: "month", key: k } };
  }

  if (period === "week") {
    const k = key && isWeekKey(key) ? key : currentWeekOf(now);
    return { type: "week", key: k, period: { kind: "week", key: k } };
  }

  // No `topperiod`: honour the pre-D27 parameter so old links keep working.
  if (legacyWeek === LEGACY_ALL) return { type: "all" };
  if (legacyWeek && isWeekKey(legacyWeek)) {
    return { type: "week", key: legacyWeek, period: { kind: "week", key: legacyWeek } };
  }

  const current = currentWeekOf(now);
  return { type: "week", key: current, period: { kind: "week", key: current } };
}
