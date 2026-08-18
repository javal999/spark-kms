import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Drift guard for the CLAUDE.md rule "all date/week logic is Asia/Jakarta,
 * Monday-based, server-side only".
 *
 * A client component that computes the Jakarta date itself (the +7h offset
 * trick) is a second implementation of `week.ts` running on an unverified
 * clock — and its output becomes `effective_date`, which drives the daily and
 * per-Area/week scoring caps. Server components pass the date down as a prop
 * instead (see app/(app)/submit/page.tsx).
 *
 * Matches the hour form (7 * 60 * 60 * 1000) and the shorthand (7 * 3600_000),
 * with or without underscores, plus the raw millisecond constant.
 */
const JAKARTA_OFFSET_MATH =
  /7\s*\*\s*60\s*\*\s*60\s*\*\s*1000|7\s*\*\s*3_?600_?000|25_?200_?000/;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("Jakarta date math stays server-side", () => {
  it("no component computes the +7h offset itself", () => {
    const offenders = tsxFiles(join(process.cwd(), "components")).filter(
      (path) => JAKARTA_OFFSET_MATH.test(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("week.ts owns the offset constant", async () => {
    const { JAKARTA_OFFSET_MINUTES, jakartaDate } = await import(
      "@/src/services/week"
    );
    expect(JAKARTA_OFFSET_MINUTES).toBe(420);
    // 2026-08-12 18:00 UTC is already 2026-08-13 in Jakarta (UTC+7).
    expect(jakartaDate(new Date("2026-08-12T18:00:00Z"))).toBe("2026-08-13");
  });
});
