import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { readSession } from "@/src/lib/session";
import { isAdmin } from "@/src/lib/session-config";
import { flags } from "@/src/lib/flags";
import { deriveActorHash } from "@/src/services/usage";
import {
  topPages,
  topClicks,
  usageTrend,
  ownFrequency,
  type DayRange,
} from "@/src/services/usage-dashboard";
import { TrendChart } from "@/components/usage-charts";
import { StatCard } from "@/components/dashboard-widgets";
import { cn } from "@/lib/utils";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

const PRESETS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

/**
 * Usage insights dashboard (Phase 7, T14). Owner-facing (admin/super), gated by
 * the tracking flag. Answers the four questions: top pages, top clicks, trend,
 * and the viewer's OWN access frequency (never anyone else's — §privacy).
 */
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  if (!flags.tracking) notFound();
  const session = await readSession();
  if (!isAdmin(session.role)) redirect("/");

  const sp = await searchParams;
  const days = Number(first(sp.days)) || 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 3600 * 1000);
  const range: DayRange = { start: ymd(start), end: ymd(end) };

  const actorHash = deriveActorHash(`u:${session.userId}`);
  const [pages, clicks, trend, own] = await Promise.all([
    topPages(range),
    topClicks(range),
    usageTrend(range),
    ownFrequency(actorHash, range),
  ]);
  const ownTotal = own.reduce((a, r) => a + r.views, 0);
  const totalViews = trend.reduce((a, t) => a + t.pageViews, 0);
  const totalClicks = trend.reduce((a, t) => a + t.clicks, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usage insights</h1>
          <p className="text-sm text-muted-foreground">
            How the app is used. Aggregates only — no per-person tracking.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border p-1">
          {PRESETS.map((p) => (
            <Link
              key={p.days}
              href={`/insights?days=${p.days}`}
              className={cn(
                "rounded px-3 py-1 text-sm",
                days === p.days
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Page views" value={totalViews} />
        <StatCard label="Tracked clicks" value={totalClicks} />
        <StatCard label="Your page views" value={ownTotal} hint="you, this range" />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Trend</h2>
        <div className="rounded-lg border bg-card p-4">
          <TrendChart data={trend} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <RankedList
          title="Top pages"
          empty="No page views yet."
          rows={pages.map((p) => ({ label: p.routePattern, value: p.views }))}
        />
        <RankedList
          title="Top clicks"
          empty="No tracked clicks yet."
          rows={clicks.map((c) => ({ label: c.label, value: c.clicks }))}
        />
      </div>
    </div>
  );
}

function RankedList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { label: string; value: number }[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="rounded-lg border bg-card">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.label} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-1/2 truncate font-mono text-xs">{r.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(r.value / max) * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right text-sm font-semibold tabular-nums">
                  {r.value}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
