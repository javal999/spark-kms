import Link from "next/link";
import { listInitiatives } from "@/src/services/initiatives";
import { readSession } from "@/src/lib/session";
import { isAdmin } from "@/src/lib/session-config";
import { InitiativesFilters } from "@/components/initiatives-filters";
import { StageBadge } from "@/components/badges";
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

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
function list(v: string | string[] | undefined): string[] {
  const s = first(v);
  return s ? s.split(",").filter(Boolean) : [];
}

const COLUMNS: { key: string; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "region", label: "Region" },
  { key: "segment", label: "Segment" },
  { key: "pillar", label: "Pillar" },
  { key: "title", label: "Title" },
  { key: "stage", label: "Stage" },
];

// v1.2 (item 12): action-items-done %. "—" when the initiative has no
// (non-cancelled) action items — distinct from 0% (has items, none done).
function donePctLabel(done: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((done / total) * 100)}%`;
}

export default async function InitiativesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  // Admins (and supers) can flip the list to archived initiatives so they can
  // find and restore one — the super-only Admin → Archived list isn't reachable
  // by plain admins. Viewers never see archived rows.
  const admin = isAdmin((await readSession()).role);
  const showArchived = admin && first(sp.archived) === "1";

  const sort = first(sp.sort) ?? "id";
  const dir = first(sp.dir) === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(first(sp.page) ?? "1"));
  const pageSize = 50;
  const categoryRaw = first(sp.category);
  const category =
    categoryRaw === "Best Practice" || categoryRaw === "Unlocking"
      ? categoryRaw
      : undefined;
  const doneRaw = first(sp.done);
  const donePct =
    doneRaw === "0" || doneRaw === "partial" || doneRaw === "100"
      ? doneRaw
      : undefined;

  const { rows, total } = await listInitiatives({
    region: list(sp.region),
    segment: list(sp.segment),
    pillar: list(sp.pillar),
    stage: list(sp.stage),
    category,
    donePct,
    q: first(sp.q),
    sort,
    dir,
    page,
    pageSize,
    ...(showArchived ? { archived: "archived" as const } : {}),
  });

  // Build a sort link that preserves other params and toggles direction.
  function sortHref(col: string): string {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const val = first(v);
      if (val && k !== "sort" && k !== "dir" && k !== "page") next.set(k, val);
    }
    const nextDir = sort === col && dir === "asc" ? "desc" : "asc";
    next.set("sort", col);
    next.set("dir", nextDir);
    return `/initiatives?${next.toString()}`;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {showArchived ? "Archived initiatives" : "Initiatives"}
        </h1>
        <div className="flex items-baseline gap-4">
          {admin && (
            <Link
              href={showArchived ? "/initiatives" : "/initiatives?archived=1"}
              className="text-sm text-muted-foreground hover:underline"
              data-testid="archived-toggle"
            >
              {showArchived ? "← Active initiatives" : "View archived"}
            </Link>
          )}
          <span className="text-sm text-muted-foreground">{total} total</span>
        </div>
      </div>

      {showArchived && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Showing <strong>archived</strong> initiatives. Open one to restore it.
        </p>
      )}

      {!showArchived && <InitiativesFilters />}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) => (
                <TableHead key={c.key}>
                  <Link
                    href={sortHref(c.key)}
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    {c.label}
                    {sort === c.key && (
                      <span aria-hidden>{dir === "asc" ? "▲" : "▼"}</span>
                    )}
                  </Link>
                </TableHead>
              ))}
              <TableHead className="text-right">Done</TableHead>
              <TableHead>Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={COLUMNS.length + 2}
                  className="py-10 text-center text-muted-foreground"
                  data-testid="empty-state"
                >
                  No initiatives match these filters yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} data-testid="initiative-row">
                <TableCell className="font-mono text-xs">#{r.id}</TableCell>
                <TableCell>{r.region}</TableCell>
                <TableCell>{r.segment}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.pillar}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/initiatives/${r.id}`}
                    className="font-medium hover:underline"
                    data-testid={`row-title-${r.id}`}
                  >
                    {r.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <StageBadge stage={r.stage} />
                </TableCell>
                <TableCell
                  className="text-right tabular-nums text-muted-foreground"
                  title={
                    r.actionTotal === 0
                      ? "No action items"
                      : `${r.actionDone} of ${r.actionTotal} action items done`
                  }
                  data-testid={`done-pct-${r.id}`}
                >
                  {donePctLabel(r.actionDone, r.actionTotal)}
                </TableCell>
                <TableCell className="space-x-1">
                  {r.hasUnlocking && (
                    <Badge
                      variant="secondary"
                      data-testid="open-unlocking"
                      title="Has an unlocking entry"
                    >
                      Unlocking
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {r.entryCount} {r.entryCount === 1 ? "entry" : "entries"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} sp={sp} />
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  sp,
}: {
  page: number;
  totalPages: number;
  sp: SP;
}) {
  function href(p: number): string {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const val = Array.isArray(v) ? v[0] : v;
      if (val && k !== "page") next.set(k, val);
    }
    next.set("page", String(p));
    return `/initiatives?${next.toString()}`;
  }
  return (
    <div className="flex items-center justify-center gap-4 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className="hover:underline">
          ← Prev
        </Link>
      ) : (
        <span className="text-muted-foreground">← Prev</span>
      )}
      <span className="text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={href(page + 1)} className="hover:underline">
          Next →
        </Link>
      ) : (
        <span className="text-muted-foreground">Next →</span>
      )}
    </div>
  );
}
