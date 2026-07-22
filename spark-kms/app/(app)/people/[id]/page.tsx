import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { people } from "@/src/db/schema";
import { flags } from "@/src/lib/flags";
import { personInitiatives } from "@/src/services/graph";
import { StageBadge } from "@/components/badges";

/**
 * Person hub (Phase 8, E8). Everything one PIC has run — flag-gated. Reached by
 * clicking a person node in the graph, or a person link on the related panel.
 */
export default async function PersonHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!flags.graph) notFound();
  const { id } = await params;
  const [person] = await db.select().from(people).where(eq(people.id, Number(id))).limit(1);
  if (!person) notFound();

  const inis = await personInitiatives(person.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/graph" className="text-sm text-muted-foreground hover:underline">
          ← Knowledge graph
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{person.name}</h1>
        <p className="text-sm text-muted-foreground">
          {inis.length} initiative{inis.length === 1 ? "" : "s"} as PIC.
        </p>
      </div>

      {inis.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          No initiatives linked to this person yet.
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
