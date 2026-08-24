/**
 * Asia/Jakarta week math. Monday 00:00 → Sunday 23:59:59.999 (requirements 4.3).
 *
 * Jakarta (WIB) is a fixed UTC+7 with no DST, so we avoid a timezone library:
 * add the offset to get "Jakarta wall clock" via UTC getters, do the calendar
 * math there, then subtract the offset to return a real UTC instant.
 *
 * Pure functions, no I/O — server-side only, unit-tested first (task 1.3).
 */

export const JAKARTA_OFFSET_MINUTES = 7 * 60;
const OFFSET_MS = JAKARTA_OFFSET_MINUTES * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Days to subtract from a given UTC-day-of-week to reach Monday (Mon→0…Sun→6). */
function daysSinceMonday(utcDay: number): number {
  return (utcDay + 6) % 7;
}

/** The Monday 00:00:00.000 (Asia/Jakarta) of the week containing `date`. */
export function weekStart(date: Date): Date {
  const jkt = new Date(date.getTime() + OFFSET_MS); // now UTC getters == Jakarta wall clock
  const back = daysSinceMonday(jkt.getUTCDay());
  const mondayMidnightJkt = Date.UTC(
    jkt.getUTCFullYear(),
    jkt.getUTCMonth(),
    jkt.getUTCDate() - back,
    0,
    0,
    0,
    0,
  );
  return new Date(mondayMidnightJkt - OFFSET_MS);
}

/** The Sunday 23:59:59.999 (Asia/Jakarta) of the week containing `date`. */
export function weekEnd(date: Date): Date {
  return new Date(weekStart(date).getTime() + WEEK_MS - 1);
}

/**
 * ISO-8601 week label "YYYY-Www" for the week containing `date`, evaluated in
 * Jakarta. Week-year follows the week's Thursday, so it can differ from the
 * calendar year at boundaries (e.g. 2027-01-01 → "2026-W53").
 */
export function weekOf(date: Date): string {
  // The Thursday of this week, as a Jakarta wall-clock UTC date (time stripped).
  const start = weekStart(date);
  const jktMonday = new Date(start.getTime() + OFFSET_MS);
  const thursday = new Date(
    Date.UTC(
      jktMonday.getUTCFullYear(),
      jktMonday.getUTCMonth(),
      jktMonday.getUTCDate() + 3,
    ),
  );
  const weekYear = thursday.getUTCFullYear();
  const jan1 = Date.UTC(weekYear, 0, 1);
  const dayOfYear = Math.round((thursday.getTime() - jan1) / DAY_MS) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

/** Parse "YYYY-Www" back into the Monday→Sunday Jakarta instant range. */
export function weekRangeFromKey(key: string): { start: Date; end: Date } {
  const match = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid week key: ${key}`);
  const weekYear = Number(match[1]);
  const week = Number(match[2]);

  // ISO: week 1 is the week containing Jan 4. Find that week's Monday, then add.
  const jan4 = new Date(Date.UTC(weekYear, 0, 4));
  const jan4Monday = new Date(
    jan4.getTime() - daysSinceMonday(jan4.getUTCDay()) * DAY_MS,
  );
  const targetMondayJkt = new Date(
    jan4Monday.getTime() + (week - 1) * WEEK_MS,
  );
  // targetMondayJkt currently holds Jakarta wall-clock midnight as a UTC value.
  const start = new Date(targetMondayJkt.getTime() - OFFSET_MS);
  return { start, end: new Date(start.getTime() + WEEK_MS - 1) };
}

/** Convenience: the ISO week key for "now" (or an injected clock in tests). */
export function currentWeekOf(now: Date = new Date()): string {
  return weekOf(now);
}

/** Format a UTC instant as its Jakarta calendar date "YYYY-MM-DD". */
export function jakartaDate(instant: Date): string {
  return new Date(instant.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** The current week key plus the previous `count-1` weeks, newest first. */
export function recentWeekKeys(count: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  const base = weekStart(now).getTime();
  for (let i = 0; i < count; i++) {
    keys.push(weekOf(new Date(base - i * WEEK_MS)));
  }
  return keys;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Human label for a week key, e.g. "29 Jun – 5 Jul 2026". */
export function formatWeekLabel(weekKey: string): string {
  const { start, end } = weekRangeFromKey(weekKey);
  const s = new Date(start.getTime() + OFFSET_MS);
  const e = new Date(end.getTime() + OFFSET_MS);
  const d = (x: Date) => `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`;
  return `${d(s)} – ${d(e)} ${e.getUTCFullYear()}`;
}

/**
 * The Monday→Sunday Jakarta date-string range for the week containing a plain
 * date string ("YYYY-MM-DD"). Used by scoring's per-area-per-week caps, which
 * compare `effective_date` (a DATE column) against the week window.
 */
export function weekDateRange(entryDate: string): { start: string; end: string } {
  const noon = new Date(`${entryDate}T12:00:00+07:00`);
  return { start: jakartaDate(weekStart(noon)), end: jakartaDate(weekEnd(noon)) };
}

// ---------------------------------------------------------------------------
// Calendar months (D27). Same Jakarta wall-clock trick as the week helpers:
// months are calendar months, so unlike weeks they never straddle a year.
// ---------------------------------------------------------------------------

/** Calendar-month key "YYYY-MM" for the month containing `date`, in Jakarta. */
export function monthOf(date: Date): string {
  const jkt = new Date(date.getTime() + OFFSET_MS);
  const m = String(jkt.getUTCMonth() + 1).padStart(2, "0");
  return `${jkt.getUTCFullYear()}-${m}`;
}

/** Parse "YYYY-MM" back into the first-instant → last-instant Jakarta range. */
export function monthRangeFromKey(key: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid month key: ${key}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid month key: ${key}`);
  // Jakarta wall-clock midnight of the 1st, and of the 1st of the next month.
  const startJkt = Date.UTC(year, month - 1, 1);
  const nextJkt = Date.UTC(year, month, 1);
  return {
    start: new Date(startJkt - OFFSET_MS),
    end: new Date(nextJkt - OFFSET_MS - 1),
  };
}

/** The current month key plus the previous `count-1` months, newest first. */
export function recentMonthKeys(count: number, now: Date = new Date()): string[] {
  const jkt = new Date(now.getTime() + OFFSET_MS);
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    // Day 15 keeps the arithmetic clear of month-length edges.
    const d = new Date(Date.UTC(jkt.getUTCFullYear(), jkt.getUTCMonth() - i, 15));
    keys.push(monthOf(new Date(d.getTime() - OFFSET_MS)));
  }
  return keys;
}

/** Human label for a month key, e.g. "Aug 2026". */
export function formatMonthLabel(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) throw new Error(`Invalid month key: ${monthKey}`);
  return `${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

/**
 * A period a score view can be restricted to (D27). `undefined` everywhere a
 * `Period` is optional means all-time, which is how the read services already
 * treated an absent week key.
 */
export type Period =
  | { kind: "week"; key: string }
  | { kind: "month"; key: string };

/** The Jakarta instant range covered by a period. */
export function periodRange(period: Period): { start: Date; end: Date } {
  return period.kind === "week"
    ? weekRangeFromKey(period.key)
    : monthRangeFromKey(period.key);
}

/** Human label for a period, delegating to the week or month formatter. */
export function formatPeriodLabel(period: Period): string {
  return period.kind === "week"
    ? formatWeekLabel(period.key)
    : formatMonthLabel(period.key);
}
