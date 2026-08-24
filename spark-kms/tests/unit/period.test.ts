import { describe, it, expect } from "vitest";
import { resolvePeriod, isWeekKey, isMonthKey } from "@/src/lib/period";
import { currentWeekOf, monthOf } from "@/src/services/week";

/**
 * Top Initiatives period filter (D27). Two levels in the query string:
 * `topperiod` picks week / month / all-time, `topkey` picks which one. The
 * pre-D27 `topweek` parameter still has to resolve, because those links are
 * already in circulation.
 */

// A fixed Jakarta clock so "the current week" is deterministic.
const NOW = new Date("2026-08-24T09:00:00+07:00");
const CURRENT_WEEK = currentWeekOf(NOW);
const CURRENT_MONTH = monthOf(NOW); // 2026-08

describe("key shape guards", () => {
  it("accepts only the ISO week form", () => {
    expect(isWeekKey("2026-W35")).toBe(true);
    expect(isWeekKey("2026-08")).toBe(false);
    expect(isWeekKey("2026-W5")).toBe(false);
  });

  it("accepts only a real calendar month", () => {
    expect(isMonthKey("2026-08")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-00")).toBe(false);
    expect(isMonthKey("2026-W35")).toBe(false);
  });
});

describe("resolvePeriod: default", () => {
  it("with no parameters at all, shows the current week", () => {
    expect(resolvePeriod({}, NOW)).toEqual({
      type: "week",
      key: CURRENT_WEEK,
      period: { kind: "week", key: CURRENT_WEEK },
    });
  });
});

describe("resolvePeriod: weekly", () => {
  it("uses the requested week", () => {
    expect(resolvePeriod({ period: "week", key: "2026-W20" }, NOW)).toEqual({
      type: "week",
      key: "2026-W20",
      period: { kind: "week", key: "2026-W20" },
    });
  });

  it("falls back to the current week when the key is missing or malformed", () => {
    for (const key of [undefined, "2026-08", "banana"]) {
      expect(resolvePeriod({ period: "week", key }, NOW).key).toBe(CURRENT_WEEK);
    }
  });
});

describe("resolvePeriod: monthly", () => {
  it("uses the requested month", () => {
    expect(resolvePeriod({ period: "month", key: "2026-06" }, NOW)).toEqual({
      type: "month",
      key: "2026-06",
      period: { kind: "month", key: "2026-06" },
    });
  });

  it("falls back to the current month when the key is missing or malformed", () => {
    for (const key of [undefined, "2026-W35", "2026-99"]) {
      expect(resolvePeriod({ period: "month", key }, NOW).key).toBe(CURRENT_MONTH);
    }
  });
});

describe("resolvePeriod: all-time", () => {
  it("carries no key and no period, which the services read as all-time", () => {
    expect(resolvePeriod({ period: "all" }, NOW)).toEqual({ type: "all" });
  });

  it("ignores a stray key", () => {
    expect(resolvePeriod({ period: "all", key: "2026-W20" }, NOW)).toEqual({
      type: "all",
    });
  });
});

describe("resolvePeriod: pre-D27 links still resolve", () => {
  it("?topweek=all-time is all-time", () => {
    expect(resolvePeriod({ legacyWeek: "all-time" }, NOW)).toEqual({
      type: "all",
    });
  });

  it("?topweek=YYYY-Www is that week", () => {
    expect(resolvePeriod({ legacyWeek: "2026-W20" }, NOW)).toEqual({
      type: "week",
      key: "2026-W20",
      period: { kind: "week", key: "2026-W20" },
    });
  });

  it("a malformed legacy value falls back to the current week", () => {
    expect(resolvePeriod({ legacyWeek: "last-tuesday" }, NOW).key).toBe(
      CURRENT_WEEK,
    );
  });

  it("the new parameter wins when both are present", () => {
    expect(
      resolvePeriod(
        { period: "month", key: "2026-06", legacyWeek: "2026-W20" },
        NOW,
      ),
    ).toEqual({
      type: "month",
      key: "2026-06",
      period: { kind: "month", key: "2026-06" },
    });
  });
});
