"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { diffWords } from "diff";
import { PILLARS, CATEGORIES, ACTION_STATUSES } from "@/src/lib/enums";
import { cn } from "@/lib/utils";

/**
 * Long text that clamps to two lines with a Read more / Show less toggle, so a
 * verbose action item never forces the page to scroll sideways. The toggle only
 * appears when the text is long enough to actually be clipped.
 */
export function ClampText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 120;
  return (
    <div className={className}>
      <p
        className={cn(
          "whitespace-pre-wrap break-words text-sm leading-relaxed",
          long && !expanded && "line-clamp-2",
        )}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

async function patchJSON(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Initiative
// ---------------------------------------------------------------------------
type InitiativeProps = {
  id: number;
  title: string;
  description: string | null;
  pillar: string;
  pic: string;
  linkUrl: string | null;
  tags: string[] | null;
};

export function EditInitiative({ initiative }: { initiative: InitiativeProps }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(initiative.title);
  const [description, setDescription] = useState(initiative.description ?? "");
  const [pillar, setPillar] = useState(initiative.pillar);
  const [pic, setPic] = useState(initiative.pic);
  const [linkUrl, setLinkUrl] = useState(initiative.linkUrl ?? "");
  const [tags, setTags] = useState((initiative.tags ?? []).join(", "));

  async function save() {
    if (!title.trim() || !pic.trim()) {
      return toast.error("Title and PIC can't be empty");
    }
    setBusy(true);
    const { ok, data } = await patchJSON(`/api/initiatives/${initiative.id}`, {
      title,
      description,
      pillar,
      pic,
      linkUrl,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setBusy(false);
    if (!ok) return toast.error(data.error ?? "Could not save changes");
    toast.success("Initiative updated");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="edit-initiative"
      >
        Edit details
      </Button>
    );
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
      data-testid="edit-initiative-form"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="PIC">
          <Input value={pic} onChange={(e) => setPic(e.target.value)} />
        </Field>
        <Field label="Pillar">
          <Select value={pillar} onValueChange={(v) => v && setPillar(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PILLARS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Link URL">
          <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
        </Field>
      </div>
      <Field label="Description">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </Field>
      <Field label="Tags (comma-separated)">
        <Input value={tags} onChange={(e) => setTags(e.target.value)} />
      </Field>
      <p className="text-xs text-muted-foreground">
        Region, Segment, and entry dates are locked — they drive the leaderboard.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy} data-testid="save-initiative">
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------
type EntryProps = {
  id: number;
  detail: string;
  followUp: string | null;
  category: string;
  linkUrl: string | null;
};

export function EditEntry({
  initiativeId,
  entry,
}: {
  initiativeId: number;
  entry: EntryProps;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(entry.detail);
  const [followUp, setFollowUp] = useState(entry.followUp ?? "");
  const [category, setCategory] = useState(entry.category);
  const [linkUrl, setLinkUrl] = useState(entry.linkUrl ?? "");

  async function save() {
    if (!detail.trim()) return toast.error("Detail can't be empty");
    setBusy(true);
    const { ok, data } = await patchJSON(
      `/api/initiatives/${initiativeId}/entries/${entry.id}`,
      { detail, followUp, category, linkUrl },
    );
    setBusy(false);
    if (!ok) return toast.error(data.error ?? "Could not save changes");
    toast.success("Entry updated");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 text-xs text-muted-foreground underline hover:text-foreground"
        data-testid={`edit-entry-${entry.id}`}
      >
        Edit
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-lg border bg-card p-3">
      <Field label="Detail">
        <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category">
          <Select value={category} onValueChange={(v) => v && setCategory(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Link URL">
          <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
        </Field>
      </div>
      <Field label="Follow-up">
        <Textarea
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          rows={2}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        The entry date is locked — it decides which week the point counts for.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy} data-testid={`save-entry-${entry.id}`}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action items (admin table with per-row inline edit + status)
// ---------------------------------------------------------------------------
type ActionItemProps = {
  id: number;
  description: string;
  pic: string;
  dueDate: string | null;
  status: string;
};

export function AdminActionItems({ items }: { items: ActionItemProps[] }) {
  return (
    <ul className="flex flex-col divide-y rounded-lg border" data-testid="action-items">
      {items.map((item) => (
        <ActionItemRow key={item.id} item={item} />
      ))}
    </ul>
  );
}

function ActionItemRow({ item }: { item: ActionItemProps }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState(item.description);
  const [pic, setPic] = useState(item.pic);
  const [dueDate, setDueDate] = useState(item.dueDate ?? "");

  async function change(patch: Record<string, unknown>, msg?: string) {
    setBusy(true);
    const { ok, data } = await patchJSON(`/api/action-items/${item.id}`, patch);
    setBusy(false);
    if (!ok) return toast.error(data.error ?? "Could not update");
    if (msg) toast.success(msg);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-3 p-3">
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="PIC">
            <Input value={pic} onChange={(e) => setPic(e.target.value)} />
          </Field>
          <Field label="Due date">
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={busy || !description.trim() || !pic.trim()}
            onClick={() =>
              change(
                { description, pic, dueDate: dueDate || undefined },
                "Action item updated",
              )
            }
            data-testid={`save-ai-${item.id}`}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-4">
      <ClampText text={item.description} className="min-w-0 flex-1" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:shrink-0 sm:justify-end">
        <span className="text-muted-foreground">
          PIC: <span className="text-foreground">{item.pic}</span>
        </span>
        <span className="text-muted-foreground">
          Due: <span className="text-foreground">{item.dueDate ?? "—"}</span>
        </span>
        <Select
          value={item.status}
          onValueChange={(v) => v && v !== item.status && change({ status: v })}
          disabled={busy}
        >
          <SelectTrigger className="h-8 w-40" data-testid={`ai-status-${item.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
          data-testid={`edit-ai-${item.id}`}
        >
          Edit
        </Button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Edit history (admin-only display) — server passes the rows in.
// ---------------------------------------------------------------------------
export type EditHistoryEntry = {
  id: number;
  entity: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  editedAt: string;
  editorName: string;
};

const ENTITY_LABEL: Record<string, string> = {
  initiative: "Initiative",
  entry: "Entry",
  action_item: "Action item",
};

/**
 * GitHub-style word-level diff of a single field's old → new value. Removed
 * words are red + struck through, added words are green; unchanged text stays
 * plain, so you can see exactly what changed instead of re-reading the whole
 * value. Falls back to an "added"/"removed" whole-value block when a side is
 * empty (field first set, or cleared).
 */
function WordDiff({
  oldValue,
  newValue,
}: {
  oldValue: string | null;
  newValue: string | null;
}) {
  const parts = diffWords(oldValue ?? "", newValue ?? "");
  return (
    <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-2 font-mono text-[13px] leading-relaxed">
      {parts.map((part, i) =>
        part.added ? (
          <span
            key={i}
            className="rounded-sm bg-green-100 text-green-900 dark:bg-green-950/60 dark:text-green-300"
          >
            {part.value}
          </span>
        ) : part.removed ? (
          <span
            key={i}
            className="rounded-sm bg-red-100 text-red-900 line-through dark:bg-red-950/60 dark:text-red-300"
          >
            {part.value}
          </span>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </p>
  );
}

export function EditHistory({ log }: { log: EditHistoryEntry[] }) {
  if (log.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="edit-history-empty">
        No edits yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3" data-testid="edit-history">
      {log.map((e) => (
        <li
          key={e.id}
          className="flex flex-col gap-1.5 rounded-lg border p-3 text-sm"
        >
          <div className="flex flex-wrap items-baseline gap-2">
            <Badge variant="outline" className="text-xs">
              {ENTITY_LABEL[e.entity] ?? e.entity}
            </Badge>
            <span className="font-medium">{e.field}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {e.editorName} ·{" "}
              {new Date(e.editedAt)
                .toISOString()
                .slice(0, 16)
                .replace("T", " ")}
            </span>
          </div>
          <WordDiff oldValue={e.oldValue} newValue={e.newValue} />
        </li>
      ))}
    </ul>
  );
}
