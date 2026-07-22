import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { tags } from "@/src/db/schema";
import { flags } from "@/src/lib/flags";
import { tagInitiatives, adjacentTags } from "@/src/services/graph";
import { StageBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";

/**
 * Tag hub (Phase 8, E9). Every initiative under a theme, plus adjacent themes
 * (tags that co-occur). Flag-gated.
 */
export default async function TagHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!flags.graph) notFound();
  const { id } = await params;
  const [tag] = await db.select().from(tags).where(eq(tags.id, Number(id))).limit(1);
  if (!tag) notFound();

  const [inis, adjacent] = await Promise.all([
    tagInitiatives(tag.id),
    adjacentTags(tag.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/graph" className="text-sm text-muted-foreground hover:underline">
          ← Knowledge graph
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">#{tag.name}</h1>
        <p className="text-sm text-muted-foreground">
          {inis.length} initiative{inis.length === 1 ? "" : "s"} tagged.
        </p>
      </div>

      {adjacent.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Related themes:</span>
          {adjacent.map((a) => (
            <Link key={a.id} href={`/tags/${a.id}`}>
              <Badge variant="outline" className="hover:bg-muted">
                {a.name} · {a.shared}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {inis.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          No initiatives under this theme yet.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {inis.map((i) => (
            <li key={i.id}>
              <Link
                href={`/initiatives/${i.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted"
              >
                <span className="flex-1 truncate font-medium">{i.title}</span>
                <StageBadge stage={i.stage} />
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {i.region} · {i.segment}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
