import Link from "next/link";
import { areaScoreEvents } from "@/src/services/scores";
import { formatWeekLabel } from "@/src/services/week";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

const REASON_LABEL: Record<string, string> = {
  new_initiative: "New initiative",
  entry: "Entry",
  bp_of_week: "Best Practice of the Week",
  best_presenter: "Best Presenter of the Week",
  adjustment: "Adjustment",
  reversal: "Reversal",
  // Retired v1.2 (reversed on migration) — labelled for historical rows.
  presentation: "Presentation (retired)",
  cee_participation: "CEE (retired)",
  cee_best: "CEE Best (retired)",
};

export default async function AreaEventsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const region = first(sp.region) ?? "";
  const segment = first(sp.segment) ?? "";
  const week = first(sp.week);
  const events = await areaScoreEvents(region, segment, week);
  const total = events.reduce((a, e) => a + e.points, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/leaderboard"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Leaderboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {region} · {segment}
        </h1>
        <p className="text-sm text-muted-foreground">
          {week ? formatWeekLabel(week) : "All-time"} · {events.length} events ·{" "}
          <span className="font-medium text-foreground">{total} pts</span>
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Initiative</TableHead>
              <TableHead>Pillar</TableHead>
              <TableHead>Contributor</TableHead>
              <TableHead className="text-right">Points</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No score events for this area.
                </TableCell>
              </TableRow>
            )}
            {events.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {e.effectiveDate}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {REASON_LABEL[e.reason] ?? e.reason}
                  </Badge>
                </TableCell>
                <TableCell>
                  {e.initiativeId ? (
                    <Link
                      href={`/initiatives/${e.initiativeId}`}
                      className="hover:underline"
                    >
                      {e.title}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">
                      {e.note ?? "—"}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {e.pillar ?? "—"}
                </TableCell>
                <TableCell>{e.pic ?? "—"}</TableCell>
                <TableCell
                  className={
                    "text-right font-semibold tabular-nums " +
                    (e.points < 0 ? "text-destructive" : "")
                  }
                >
                  {e.points > 0 ? `+${e.points}` : e.points}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
