import { describe, it, expect } from "vitest";
import {
  weekStart,
  weekEnd,
  weekOf,
  weekRangeFromKey,
  weekDateRange,
  recentWeekKeys,
  formatWeekLabel,
} from "@/src/services/week";

/**
 * Week = Monday 00:00 → Sunday 23:59:59.999, Asia/Jakarta (UTC+7, DST-free),
 * per requirements section 4.3. Jakarta is +7h ahead of UTC, so a Jakarta
 * Monday 00:00 is the prior Sunday 17:00 UTC.
 */

// A Jakarta instant helper: builds the UTC Date for a given Jakarta wall time.
function jkt(iso: string): Date {
  // iso like "2026-07-01T09:30:00" interpreted as Jakarta local (+07:00).
  return new Date(`${iso}+07:00`);
}

describe("weekStart / weekEnd", () => {
  it("returns Monday 00:00 Jakarta for a mid-week date", () => {
    // 2026-07-01 is a Wednesday; its week starts Mon 2026-06-29 Jakarta.
    const start = weekStart(jkt("2026-07-01T09:30:00"));
    expect(start.toISOString()).toBe("2026-06-28T17:00:00.000Z"); // Mon 06-29 00:00 +07
  });

  it("returns Sunday 23:59:59.999 Jakarta for weekEnd", () => {
    const end = weekEnd(jkt("2026-07-01T09:30:00"));
    expect(end.toISOString()).toBe("2026-07-05T16:59:59.999Z"); // Sun 07-05 23:59:59.999 +07
  });

  it("weekEnd is exactly 7 days minus 1ms after weekStart", () => {
    const d = jkt("2026-03-18T12:00:00");
    expect(weekEnd(d).getTime() - weekStart(d).getTime()).toBe(
      7 * 24 * 60 * 60 * 1000 - 1,
    );
  });

  it("Monday 00:00 Jakarta belongs to its own week (inclusive start)", () => {
    const monday = jkt("2026-07-06T00:00:00");
    expect(weekStart(monday).toISOString()).toBe("2026-07-05T17:00:00.000Z");
  });

  it("Sunday 23:59 Jakarta belongs to the prior week", () => {
    const sundayLate = jkt("2026-07-05T23:59:00");
    expect(weekStart(sundayLate).toISOString()).toBe(
      "2026-06-28T17:00:00.000Z",
    );
  });

  it("handles the UTC/Jakarta day boundary correctly", () => {
    // 2026-07-05T16:00:00Z == Jakarta Sun 2026-07-05 23:00 → prior week.
    expect(weekStart(new Date("2026-07-05T16:00:00Z")).toISOString()).toBe(
      "2026-06-28T17:00:00.000Z",
    );
    // 2026-07-05T17:00:00Z == Jakarta Mon 2026-07-06 00:00 → new week.
    expect(weekStart(new Date("2026-07-05T17:00:00Z")).toISOString()).toBe(
      "2026-07-05T17:00:00.000Z",
    );
  });
});

describe("weekOf (ISO YYYY-Www, Jakarta)", () => {
  it("labels a normal week", () => {
    expect(weekOf(jkt("2026-07-06T10:00:00"))).toBe("2026-W28");
  });

  it("year boundary: Monday 2026-12-28 is 2026-W53", () => {
    expect(weekOf(jkt("2026-12-28T00:00:00"))).toBe("2026-W53");
  });

  it("year boundary: 2027-01-01 (Fri) still belongs to 2026-W53", () => {
    // ISO week-year rolls with the Thursday, not the calendar year.
    expect(weekOf(jkt("2027-01-01T12:00:00"))).toBe("2026-W53");
  });

  it("year boundary: Monday 2027-01-04 starts 2027-W01", () => {
    expect(weekOf(jkt("2027-01-04T00:00:00"))).toBe("2027-W01");
  });

  it("pads single-digit week numbers", () => {
    expect(weekOf(jkt("2026-01-05T00:00:00"))).toBe("2026-W02");
  });
});

describe("weekRangeFromKey", () => {
  it("round-trips with weekOf", () => {
    const d = jkt("2026-07-01T09:30:00");
    const key = weekOf(d);
    const { start, end } = weekRangeFromKey(key);
    expect(start.toISOString()).toBe(weekStart(d).toISOString());
    expect(end.toISOString()).toBe(weekEnd(d).toISOString());
  });

  it("resolves the 2026-W53 boundary week range", () => {
    const { start, end } = weekRangeFromKey("2026-W53");
    expect(start.toISOString()).toBe("2026-12-27T17:00:00.000Z"); // Mon 12-28 00:00 +07
    expect(end.toISOString()).toBe("2027-01-03T16:59:59.999Z"); // Sun 01-03 23:59:59.999 +07
  });
});

describe("weekDateRange (Jakarta date strings for scoring caps)", () => {
  it("returns Monday→Sunday date strings for a mid-week date", () => {
    // 2026-07-01 (Wed) → week Mon 2026-06-29 .. Sun 2026-07-05.
    expect(weekDateRange("2026-07-01")).toEqual({
      start: "2026-06-29",
      end: "2026-07-05",
    });
  });

  it("keeps a Monday in its own week and a Sunday in the prior week", () => {
    expect(weekDateRange("2026-07-06").start).toBe("2026-07-06"); // Monday
    expect(weekDateRange("2026-07-05").start).toBe("2026-06-29"); // Sunday → prior Mon
  });
});

describe("recentWeekKeys / formatWeekLabel", () => {
  it("returns the current week + previous weeks, newest first, no dupes", () => {
    const keys = recentWeekKeys(4, new Date("2026-07-08T05:00:00Z")); // Jakarta Wed 2026-07-08
    expect(keys).toEqual(["2026-W28", "2026-W27", "2026-W26", "2026-W25"]);
  });

  it("formats a week label as a Jakarta date range", () => {
    expect(formatWeekLabel("2026-W28")).toBe("6 Jul – 12 Jul 2026");
  });
});
