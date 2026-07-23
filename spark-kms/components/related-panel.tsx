import Link from "next/link";
import { relatedInitiatives, egoGraph } from "@/src/services/links";
import { initiativeEntities } from "@/src/services/graph";
import { listSuggestions } from "@/src/services/suggestions";
import { Badge } from "@/components/ui/badge";
import { GraphCanvas } from "@/components/graph-canvas";
import { SuggestedConnections } from "@/components/suggested-connections";

const TYPE_LABEL: Record<string, string> = {
  explicit: "Linked",
  co_tag: "Shared tags",
  replicated_from: "Replicated from",
};

/**
 * Related-initiatives panel (Phase 7, task T10). Read-only list of backlinks,
 * forward links, and co-tag relations for one initiative; each opens that
 * initiative. Shows an empty state (not an error) when there are no relations.
 * Rendered only when the graph flag is on.
 */
export async function RelatedPanel({ id, admin = false }: { id: number; admin?: boolean }) {
  const [related, ego, entities, suggestions] = await Promise.all([
    relatedInitiatives(id),
    egoGraph(id),
    initiativeEntities(id),
    admin ? listSuggestions(id) : Promise.resolve([]),
  ]);
  // Only worth drawing when this initiative actually has neighbors.
  const hasGraph = ego.nodes.length > 1;

  return (
    <section className="flex flex-col gap-3" data-track="related-panel">
      <h2 className="text-lg font-medium">Related initiatives</h2>

      {admin && suggestions.length > 0 && (
        <SuggestedConnections initiativeId={id} suggestions={suggestions} />
      )}

      {(entities.person || entities.tags.length > 0) && (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm">
          {entities.person && (
            <div className="flex items-center gap-2">
              <span className="w-16 text-muted-foreground">People</span>
              <Link
                href={`/people/${entities.person.id}`}
                className="font-medium hover:underline"
              >
                {entities.person.name}
              </Link>
            </div>
          )}
          {entities.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-16 text-muted-foreground">Themes</span>
              {entities.tags.map((t) => (
                <Link key={t.id} href={`/tags/${t.id}`}>
                  <Badge variant="outline" className="hover:bg-muted">
                    {t.name}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      {related.length === 0 ? (
        <div
          className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground"
          data-testid="related-empty"
        >
          No related initiatives yet — link one, or add a shared tag.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {related.map((r, i) => (
            <li key={`${r.node.id}-${r.type}-${i}`}>
              <Link
                href={`/initiatives/${r.node.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted"
                data-track="related-item"
              >
                <span className="flex-1 truncate font-medium">{r.node.title}</span>
                {r.sharedTags?.length ? (
                  <span className="hidden text-xs text-muted-foreground md:inline">
                    {r.sharedTags.join(", ")}
                  </span>
                ) : null}
                <Badge variant="outline">
                  {TYPE_LABEL[r.type] ?? r.type}
                  {r.type !== "co_tag" && r.direction === "backward" ? " ←" : ""}
                </Badge>
                <Badge variant="outline" className="hidden sm:inline-flex">
                  {r.node.region} · {r.node.segment}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {hasGraph && (
        <GraphCanvas nodes={ego.nodes} edges={ego.edges} height={340} />
      )}
    </section>
  );
}
