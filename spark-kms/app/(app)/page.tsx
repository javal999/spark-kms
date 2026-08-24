import Link from "next/link";
import { dashboardStats, topInitiatives } from "@/src/services/scores";
import {
  recentWeekKeys,
  formatWeekLabel,
  recentMonthKeys,
  formatMonthLabel,
} from "@/src/services/week";
import {
  resolvePeriod,
  PERIOD_PARAM,
  KEY_PARAM,
  LEGACY_PARAM,
} from "@/src/lib/period";
import { StatCard, DistributionBars } from "@/components/dashboard-widgets";
import { PeriodSelector } from "@/components/period-selector";
import { Badge } from "@/components/ui/badge";
import { readSession } from "@/src/lib/session";
import { isAdmin } from "@/src/lib/session-config";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

const enc = (k: string, v: string) => `/initiatives?${k}=${encodeURIComponent(v)}`;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const weeks = recentWeekKeys(8).map((key) => ({
    key,
    label: formatWeekLabel(key),
  }));
  const months = recentMonthKeys(6).map((key) => ({
    key,
    label: formatMonthLabel(key),
  }));
  // v1.2 (item 10), reshaped in D27: Top Initiatives defaults to the current
  // week and can be switched to any recent week, any recent month, or all-time.
  // The pre-D27 `?topweek=` links still resolve — see src/lib/period.ts.
  const currentWeek = weeks[0]?.key ?? "";
  const selection = resolvePeriod({
    period: first(sp[PERIOD_PARAM]),
    key: first(sp[KEY_PARAM]),
    legacyWeek: first(sp[LEGACY_PARAM]),
  });
  // A hand-edited or bookmarked URL can name a period outside the recent lists;
  // add it so the picker shows what the list below is actually filtered to.
  const known = selection.type === "month" ? months : weeks;
  const options =
    selection.key && !known.some((o) => o.key === selection.key)
      ? [
          {
            key: selection.key,
            label:
              selection.type === "month"
                ? formatMonthLabel(selection.key)
                : formatWeekLabel(selection.key),
          },
          ...known,
        ]
      : known;

  const [stats, top, session] = await Promise.all([
    dashboardStats(),
    topInitiatives(selection.period, 8),
    readSession(),
  ]);
  const admin = isAdmin(session.role);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          How many, what stage, where — every number opens the filtered list.
        </p>
      </div>

      {stats.total === 0 && (
        <div
          className="rounded-lg border border-dashed bg-muted/30 p-6 text-center"
          data-testid="dashboard-empty"
        >
          <p className="font-medium">No initiatives yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Record the first best practice or unlocking — or bulk-import the
            historical spreadsheet — from the Submit page.
          </p>
          {admin && (
            <Link
              href="/submit"
              className="mt-3 inline-block rounded-md border bg-background px-4 py-2 text-sm hover:bg-muted"
            >
              Go to Submit →
            </Link>
          )}
        </div>
      )}

      {/* Counters */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total initiatives" value={stats.total} href="/initiatives" />
        <StatCard
          label="New this week"
          value={stats.newThisWeek}
          href="/initiatives"
          hint="created since Monday (Jakarta)"
        />
        <StatCard label="Existing" value={stats.existing} href="/initiatives" />
        <StatCard
          label="Open unlockings"
          value={stats.withUnlocking}
          href={enc("category", "Unlocking")}
          hint="initiatives with an unlocking"
          emphasis
        />
      </div>

      {/* Stage summary */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">By stage</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {["Idea", "Pilot", "Running", "Ready to Scale"].map((s) => (
            <Link
              key={s}
              href={enc("stage", s)}
              className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm hover:border-foreground/30"
            >
              <span className="text-foreground/80">{s}</span>
              <span className="text-lg font-semibold tabular-nums">
                {stats.byStage[s] ?? 0}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Distributions */}
      <section className="grid gap-4 lg:grid-cols-3">
        <DistributionBars
          title="By pillar"
          data={stats.byPillar}
          hrefFor={(k) => enc("pillar", k)}
        />
        <DistributionBars
          title="By region"
          data={stats.byRegion}
          hrefFor={(k) => enc("region", k)}
        />
        <DistributionBars
          title="By segment"
          data={stats.bySegment}
          hrefFor={(k) => enc("segment", k)}
        />
      </section>

      {/* Top initiatives */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Top Initiatives</h2>
          <PeriodSelector
            type={selection.type}
            periodKey={selection.key}
            weeks={selection.type === "month" ? weeks : options}
            months={selection.type === "month" ? options : months}
            defaultKey={currentWeek}
          />
        </div>
        <div className="rounded-lg border bg-card">
          {top.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No scored initiatives{" "}
              {selection.type === "week"
                ? "in this week"
                : selection.type === "month"
                  ? "in this month"
                  : "yet"}
              .
            </p>
          ) : (
            <ol className="divide-y">
              {top.map((t, i) => (
                <li key={t.id}>
                  <Link
                    href={`/initiatives/${t.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-muted"
                  >
                    <span className="w-6 text-center font-mono text-sm text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate font-medium">
                      {t.title}
                    </span>
                    <span className="hidden text-xs text-muted-foreground md:inline">
                      {t.pic}
                    </span>
                    <Badge variant="outline" className="hidden sm:inline-flex">
                      {t.stage}
                    </Badge>
                    <Badge variant="outline" className="hidden lg:inline-flex">
                      {t.region} · {t.segment}
                    </Badge>
                    <span className="w-12 text-right font-semibold tabular-nums">
                      {t.points}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}
