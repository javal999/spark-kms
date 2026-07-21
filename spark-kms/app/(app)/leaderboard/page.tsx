import Link from "next/link";
import { areaLeaderboard } from "@/src/services/scores";
import { recentWeekKeys, formatWeekLabel } from "@/src/services/week";
import { WeekSelector } from "@/components/week-selector";
import { cn } from "@/lib/utils";
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

const STREAMS = [
  { key: "best_practice", label: "Best Practice" },
  { key: "best_presenter", label: "Best Presenter" },
] as const;

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const week = first(sp.week);
  const board = await areaLeaderboard(week);
  const weeks = recentWeekKeys(8).map((key) => ({
    key,
    label: formatWeekLabel(key),
  }));

  function cellHref(region: string, segment: string) {
    const p = new URLSearchParams({ region, segment });
    if (week) p.set("week", week);
    return `/leaderboard/area?${p.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Area leaderboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Region × Segment. {week ? formatWeekLabel(week) : "All-time"}.
          </p>
        </div>
        <WeekSelector param="week" weeks={weeks} />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Rank</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Segment</TableHead>
              {STREAMS.map((s) => (
                <TableHead key={s.key} className="text-right">
                  {s.label}
                </TableHead>
              ))}
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {board.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4 + STREAMS.length}
                  className="py-10 text-center text-muted-foreground"
                >
                  No areas yet — create an initiative to get on the board.
                </TableCell>
              </TableRow>
            )}
            {board.map((row) => {
              const podium = row.rank <= 3;
              return (
                <TableRow
                  key={`${row.region}/${row.segment}`}
                  className={cn(podium && "bg-primary/[0.04]")}
                  data-testid="leaderboard-row"
                >
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                        podium
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {row.rank}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{row.region}</TableCell>
                  <TableCell>{row.segment}</TableCell>
                  {STREAMS.map((s) => (
                    <TableCell key={s.key} className="text-right tabular-nums">
                      <Link
                        href={cellHref(row.region, row.segment)}
                        className="text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {row[s.key]}
                      </Link>
                    </TableCell>
                  ))}
                  <TableCell className="text-right text-base font-semibold tabular-nums">
                    {row.total}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
