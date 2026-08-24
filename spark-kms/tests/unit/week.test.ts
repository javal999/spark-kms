import { describe, it, expect } from "vitest";
import {
  weekStart,
  weekEnd,
  weekOf,
  weekRangeFromKey,
  weekDateRange,
  recentWeekKeys,
  formatWeekLabel,
  monthOf,
  monthRangeFromKey,
  recentMonthKeys,
  formatMonthLabel,
  periodRange,
  formatPeriodLabel,
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

// ---------------------------------------------------------------------------
// Calendar months (D27). Same Jakarta rules as the week helpers above.
// ---------------------------------------------------------------------------

describe("monthOf", () => {
  it("returns the Jakarta calendar month", () => {
    expect(monthOf(jkt("2026-08-24T10:00:00"))).toBe("2026-08");
    expect(monthOf(jkt("2026-01-01T00:00:00"))).toBe("2026-01");
    expect(monthOf(jkt("2026-12-31T23:59:59"))).toBe("2026-12");
  });

  it("uses Jakarta, not UTC, at the month boundary", () => {
    // 2026-08-31T20:00 UTC is 2026-09-01T03:00 Jakarta.
    expect(monthOf(new Date("2026-08-31T20:00:00Z"))).toBe("2026-09");
    // 2026-09-01T00:30 UTC is still 2026-09-01 in Jakarta (07:30).
    expect(monthOf(new Date("2026-09-01T00:30:00Z"))).toBe("2026-09");
    // 2026-08-31T16:59 UTC is 2026-08-31T23:59 Jakarta — still August.
    expect(monthOf(new Date("2026-08-31T16:59:00Z"))).toBe("2026-08");
  });
});

describe("monthRangeFromKey", () => {
  it("spans the first instant to the last instant of the month, Jakarta", () => {
    const { start, end } = monthRangeFromKey("2026-08");
    expect(start.toISOString()).toBe("2026-07-31T17:00:00.000Z"); // 1 Aug 00:00 WIB
    expect(end.toISOString()).toBe("2026-08-31T16:59:59.999Z"); // 31 Aug 23:59:59.999 WIB
  });

  it("handles February and a year boundary", () => {
    expect(monthRangeFromKey("2026-02").end.toISOString()).toBe(
      "2026-02-28T16:59:59.999Z",
    );
    expect(monthRangeFromKey("2028-02").end.toISOString()).toBe(
      "2028-02-29T16:59:59.999Z", // leap year
    );
    expect(monthRangeFromKey("2026-12").end.toISOString()).toBe(
      "2026-12-31T16:59:59.999Z",
    );
  });

  it("round-trips with monthOf at both edges", () => {
    for (const key of ["2026-01", "2026-08", "2026-12"]) {
      const { start, end } = monthRangeFromKey(key);
      expect(monthOf(start)).toBe(key);
      expect(monthOf(end)).toBe(key);
    }
  });

  it("rejects a malformed or impossible key", () => {
    expect(() => monthRangeFromKey("2026-13")).toThrow();
    expect(() => monthRangeFromKey("2026-00")).toThrow();
    expect(() => monthRangeFromKey("2026-W08")).toThrow();
    expect(() => monthRangeFromKey("not-a-month")).toThrow();
  });
});

describe("recentMonthKeys", () => {
  it("returns the current month first, then back in order", () => {
    expect(recentMonthKeys(6, jkt("2026-08-24T09:00:00"))).toEqual([
      "2026-08",
      "2026-07",
      "2026-06",
      "2026-05",
      "2026-04",
      "2026-03",
    ]);
  });

  it("crosses the year boundary backwards", () => {
    expect(recentMonthKeys(3, jkt("2026-01-15T09:00:00"))).toEqual([
      "2026-01",
      "2025-12",
      "2025-11",
    ]);
  });

  it("does not skip a month when today is the 31st", () => {
    // Naive month arithmetic on the 31st lands on 1 March; day 15 avoids it.
    expect(recentMonthKeys(3, jkt("2026-03-31T09:00:00"))).toEqual([
      "2026-03",
      "2026-02",
      "2026-01",
    ]);
  });
});

describe("formatMonthLabel", () => {
  it("formats as short month plus year", () => {
    expect(formatMonthLabel("2026-08")).toBe("Aug 2026");
    expect(formatMonthLabel("2026-01")).toBe("Jan 2026");
    expect(formatMonthLabel("2025-12")).toBe("Dec 2025");
  });

  it("rejects a malformed key", () => {
    expect(() => formatMonthLabel("2026-8")).toThrow();
  });
});

describe("periodRange", () => {
  it("delegates to the week helper for a week period", () => {
    expect(periodRange({ kind: "week", key: "2026-W35" })).toEqual(
      weekRangeFromKey("2026-W35"),
    );
  });

  it("delegates to the month helper for a month period", () => {
    expect(periodRange({ kind: "month", key: "2026-08" })).toEqual(
      monthRangeFromKey("2026-08"),
    );
  });
});

describe("formatPeriodLabel", () => {
  it("formats each kind with its own formatter", () => {
    expect(formatPeriodLabel({ kind: "month", key: "2026-08" })).toBe("Aug 2026");
    expect(formatPeriodLabel({ kind: "week", key: "2026-W35" })).toBe(
      formatWeekLabel("2026-W35"),
    );
  });
});
