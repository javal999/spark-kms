import Link from "next/link";
import { notFound } from "next/navigation";
import { getInitiativeDetail } from "@/src/services/initiatives";
import { getInitiativeEditLog } from "@/src/services/edits";
import { initiativeStreamTotals } from "@/src/services/scores";
import { readSession } from "@/src/lib/session";
import { isAdmin } from "@/src/lib/session-config";
import { StageControl } from "@/components/stage-control";
import { CategoryBadge, StageBadge } from "@/components/badges";
import {
  EditInitiative,
  EditEntry,
  AdminActionItems,
  EditHistory,
  ClampText,
} from "@/components/detail-edit";
import { Badge } from "@/components/ui/badge";

export default async function InitiativeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getInitiativeDetail(Number(id));
  if (!detail) notFound();

  const session = await readSession();
  const admin = isAdmin(session.role);
  const { initiative, entries, actionItems, stageChanges } = detail;
  const points = await initiativeStreamTotals(initiative.id);
  const editHistory = admin ? await getInitiativeEditLog(initiative.id) : [];

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link
          href="/initiatives"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← All initiatives
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              <span className="font-mono text-base text-muted-foreground">
                #{initiative.id}
              </span>{" "}
              {initiative.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge>{initiative.region}</Badge>
              <Badge>{initiative.segment}</Badge>
              <Badge variant="outline">{initiative.pillar}</Badge>
              <span>PIC: {initiative.pic}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-muted-foreground">Stage</span>
            {admin ? (
              <StageControl
                initiativeId={initiative.id}
                stage={initiative.stage}
              />
            ) : (
              <span data-testid="stage-badge">
                <StageBadge stage={initiative.stage} />
              </span>
            )}
          </div>
        </div>
        {initiative.description && (
          <p className="max-w-3xl text-sm text-foreground/90">
            {initiative.description}
          </p>
        )}
        {initiative.linkUrl && (
          <a
            href={initiative.linkUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            {initiative.linkUrl}
          </a>
        )}
        {admin && (
          <div className="mt-1">
            <EditInitiative
              initiative={{
                id: initiative.id,
                title: initiative.title,
                description: initiative.description,
                pillar: initiative.pillar,
                pic: initiative.pic,
                linkUrl: initiative.linkUrl,
                tags: initiative.tags,
              }}
            />
          </div>
        )}
      </div>

      {/* Points panel — per-stream SUM for this initiative (never stored). */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(
          [
            ["Best Practice", points.best_practice],
            ["Presenter", points.presenter],
            ["CEE", points.cee],
            ["CEE Best", points.cee_best],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card px-4 py-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
        <div className="rounded-lg border border-primary/30 bg-primary/[0.04] px-4 py-3">
          <div className="text-xs text-muted-foreground">Total</div>
          <div
            className="text-xl font-semibold tabular-nums"
            data-testid="points-total"
          >
            {points.total}
          </div>
        </div>
      </section>

      {/* Entry timeline — newest first, connected by a left rail. */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-medium">Entries</h2>
          <span className="text-sm text-muted-foreground">{entries.length}</span>
        </div>
        <ol
          className="relative ml-1.5 flex flex-col gap-5 border-l pl-6"
          data-testid="entry-timeline"
        >
          {entries.map((e) => (
            <li key={e.id} className="relative">
              {/* node on the rail */}
              <span
                className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-background bg-primary"
                aria-hidden
              />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  {e.entryDate}
                </span>
                <CategoryBadge category={e.category} />
                {e.bpOfWeekConfirmedAt ? (
                  <Badge className="border-amber-300 bg-amber-100 text-amber-900">
                    ★ BP of the Week
                  </Badge>
                ) : e.bpOfWeekNominated ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    BP nominated
                  </Badge>
                ) : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                {e.detail}
              </p>
              {e.followUp && (
                <p className="mt-2 rail rounded-r bg-muted/50 px-3 py-2 text-sm">
                  <span className="font-medium">Follow-up: </span>
                  {e.followUp}
                </p>
              )}
              {e.linkUrl && (
                <a
                  href={e.linkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-primary hover:underline"
                >
                  {e.linkUrl}
                </a>
              )}
              {admin && (
                <div>
                  <EditEntry
                    initiativeId={initiative.id}
                    entry={{
                      id: e.id,
                      detail: e.detail,
                      followUp: e.followUp,
                      category: e.category,
                      linkUrl: e.linkUrl,
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* Action items */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Action items</h2>
        {actionItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No action items.</p>
        ) : admin ? (
          <AdminActionItems
            items={actionItems.map((a) => ({
              id: a.id,
              description: a.description,
              pic: a.pic,
              dueDate: a.dueDate,
              status: a.status,
            }))}
          />
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {actionItems.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-4"
              >
                <ClampText text={a.description} className="min-w-0 flex-1" />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:shrink-0 sm:justify-end">
                  <span className="text-muted-foreground">
                    PIC: <span className="text-foreground">{a.pic}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Due: <span className="text-foreground">{a.dueDate ?? "—"}</span>
                  </span>
                  <Badge variant="outline">{a.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Stage history */}
      {stageChanges.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Stage history</h2>
          <ul className="text-sm text-muted-foreground">
            {stageChanges.map((s) => (
              <li key={s.id}>
                {s.fromStage} → {s.toStage} ·{" "}
                {new Date(s.changedAt).toISOString().slice(0, 10)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Edit history — admin only (never rendered for viewers). */}
      {admin && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Edit history</h2>
          <EditHistory
            log={editHistory.map((e) => ({
              id: e.id,
              entity: e.entity,
              field: e.field,
              oldValue: e.oldValue,
              newValue: e.newValue,
              editedAt: e.editedAt.toISOString(),
              editorName: e.editorName,
            }))}
          />
        </section>
      )}
    </div>
  );
}
