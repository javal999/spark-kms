"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  REGIONS,
  SEGMENTS,
  PILLARS,
  CATEGORIES,
  STAGES,
} from "@/src/lib/enums";

type Candidate = {
  id: number;
  title: string;
  region: string;
  segment: string;
  pic: string;
  stage: string;
  similarity: number;
};

type Phase = "basics" | "resolve" | "new" | "append";

type EntryState = {
  entryDate: string;
  category: string;
  detail: string;
  followUp: string;
  linkUrl: string;
  bpOfWeekNominated: boolean;
  bestPresenter: boolean;
  createActionItem: boolean;
  aiPic: string;
  aiDueDate: string;
};

function todayJakarta(): string {
  // Jakarta is UTC+7; shift then take the date part.
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

// Soft warning (requirements §5.1): entry_date more than 30 days old. Mirrors
// isStaleEntryDate in validation/entry.ts (kept local so the client bundle
// doesn't pull in the Drizzle schema).
function isStale(entryDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return false;
  const [y, m, d] = entryDate.split("-").map(Number);
  const ageDays = (Date.now() - Date.UTC(y, m - 1, d)) / 86_400_000;
  return ageDays > 30;
}

const emptyEntry: EntryState = {
  entryDate: todayJakarta(),
  category: "Best Practice",
  detail: "",
  followUp: "",
  linkUrl: "",
  bpOfWeekNominated: false,
  bestPresenter: false,
  createActionItem: false,
  aiPic: "",
  aiDueDate: "",
};

export function SubmitForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("basics");
  const [pending, setPending] = useState(false);

  // Step 1 basics
  const [region, setRegion] = useState("");
  const [segment, setSegment] = useState("");
  const [title, setTitle] = useState("");

  // Duplicate resolution
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [appendTarget, setAppendTarget] = useState<Candidate | null>(null);

  // New-initiative extra fields
  const [pic, setPic] = useState("");
  const [pillar, setPillar] = useState("");
  const [stage, setStage] = useState("Idea");
  const [description, setDescription] = useState("");

  // Entry
  const [entry, setEntry] = useState<EntryState>(emptyEntry);
  const setE = (patch: Partial<EntryState>) =>
    setEntry((prev) => ({ ...prev, ...patch }));

  async function checkDuplicates() {
    if (!region || !segment || !title.trim()) {
      toast.error("Region, Segment and Title are required");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/initiatives/duplicates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      const found: Candidate[] = data.candidates ?? [];
      setCandidates(found);
      setPhase(found.length > 0 ? "resolve" : "new");
    } catch {
      toast.error("Could not check for duplicates");
    } finally {
      setPending(false);
    }
  }

  function entryPayload() {
    return {
      entryDate: entry.entryDate,
      category: entry.category,
      detail: entry.detail,
      followUp: entry.followUp || undefined,
      linkUrl: entry.linkUrl || undefined,
      bpOfWeekNominated: entry.bpOfWeekNominated,
      bestPresenter: entry.bestPresenter,
      createActionItem: entry.createActionItem && !!entry.followUp.trim(),
      actionItem:
        entry.createActionItem && entry.followUp.trim()
          ? {
              description: entry.followUp,
              pic: entry.aiPic || pic || appendTarget?.pic || "Unassigned",
              dueDate: entry.aiDueDate || undefined,
            }
          : undefined,
    };
  }

  async function submitNew() {
    if (!pic.trim() || !pillar) {
      toast.error("PIC and Pillar are required");
      return;
    }
    if (!entry.detail.trim()) {
      toast.error("Progress detail is required");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/initiatives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          region,
          segment,
          pillar,
          stage,
          pic,
          description: description || undefined,
          forceNew: true,
          ...entryPayload(),
        }),
      });
      if (!res.ok) return toastError(res);
      const data = await res.json();
      toast.success("Initiative created");
      router.push(`/initiatives/${data.initiativeId}`);
      router.refresh();
    } catch {
      toast.error("Network error");
    } finally {
      setPending(false);
    }
  }

  async function submitAppend() {
    if (!appendTarget) return;
    if (!entry.detail.trim()) {
      toast.error("Progress detail is required");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(
        `/api/initiatives/${appendTarget.id}/entries`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(entryPayload()),
        },
      );
      if (!res.ok) return toastError(res);
      toast.success(`Entry appended to #${appendTarget.id}`);
      router.push(`/initiatives/${appendTarget.id}`);
      router.refresh();
    } catch {
      toast.error("Network error");
    } finally {
      setPending(false);
    }
  }

  async function toastError(res: Response) {
    const data = await res.json().catch(() => ({}));
    toast.error(data.error ?? "Request failed");
  }

  // ---- render ----
  return (
    <div className="flex flex-col gap-6">
      <StepBasics
        region={region}
        segment={segment}
        title={title}
        setRegion={setRegion}
        setSegment={setSegment}
        setTitle={setTitle}
        locked={phase !== "basics"}
      />

      {phase === "basics" && (
        <div>
          <Button
            onClick={checkDuplicates}
            disabled={pending}
            data-testid="check-duplicates"
          >
            {pending ? "Checking…" : "Continue"}
          </Button>
        </div>
      )}

      {phase === "resolve" && (
        <Card data-testid="duplicate-gate">
          <CardHeader>
            <CardTitle>Similar themes found</CardTitle>
            <CardDescription>
              Append your entry to an existing topic, or create a new one.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {candidates.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    #{c.id} · {c.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.region} · {c.segment} · {c.pic} · {c.stage} ·{" "}
                    {(c.similarity * 100).toFixed(0)}% match
                  </span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid={`append-${c.id}`}
                  onClick={() => {
                    setAppendTarget(c);
                    setPhase("append");
                  }}
                >
                  Append to #{c.id}
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              data-testid="force-new"
              onClick={() => setPhase("new")}
            >
              None of these — create a new topic
            </Button>
          </CardContent>
        </Card>
      )}

      {phase === "append" && appendTarget && (
        <Card>
          <CardHeader>
            <CardTitle>Append to #{appendTarget.id}</CardTitle>
            <CardDescription>
              {appendTarget.title} · {appendTarget.region} ·{" "}
              {appendTarget.segment} · {appendTarget.pic}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <EntryFields entry={entry} setE={setE} pic={appendTarget.pic} />
            <div className="flex gap-2">
              <Button
                onClick={submitAppend}
                disabled={pending}
                data-testid="submit-append"
              >
                {pending ? "Saving…" : "Append entry"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setPhase("resolve")}
                disabled={pending}
              >
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === "new" && (
        <Card>
          <CardHeader>
            <CardTitle>New topic</CardTitle>
            <CardDescription>{title}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="PIC (field person)">
                <Input
                  value={pic}
                  onChange={(e) => setPic(e.target.value)}
                  data-testid="pic"
                />
              </Field>
              <Field label="Pillar">
                <EnumSelect
                  value={pillar}
                  onChange={setPillar}
                  options={PILLARS}
                  placeholder="Select pillar"
                  testid="pillar"
                />
              </Field>
              <Field label="Stage">
                <EnumSelect
                  value={stage}
                  onChange={setStage}
                  options={STAGES}
                  placeholder="Stage"
                  testid="stage"
                />
              </Field>
            </div>
            <Field label="Description (optional)">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <hr />
            <EntryFields entry={entry} setE={setE} pic={pic} />
            <div className="flex gap-2">
              <Button
                onClick={submitNew}
                disabled={pending}
                data-testid="submit-new"
              >
                {pending ? "Saving…" : "Create initiative"}
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  setPhase(candidates.length ? "resolve" : "basics")
                }
                disabled={pending}
              >
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepBasics(props: {
  region: string;
  segment: string;
  title: string;
  setRegion: (v: string) => void;
  setSegment: (v: string) => void;
  setTitle: (v: string) => void;
  locked: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 1 · Basics</CardTitle>
        <CardDescription>Region, Segment, and the topic title.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Region">
          <EnumSelect
            value={props.region}
            onChange={props.setRegion}
            options={REGIONS}
            placeholder="Select region"
            disabled={props.locked}
            testid="region"
          />
        </Field>
        <Field label="Segment">
          <EnumSelect
            value={props.segment}
            onChange={props.setSegment}
            options={SEGMENTS}
            placeholder="Select segment"
            disabled={props.locked}
            testid="segment"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Topic / Tema">
            <Input
              value={props.title}
              onChange={(e) => props.setTitle(e.target.value)}
              disabled={props.locked}
              data-testid="title"
              placeholder="e.g. Pop up store make over"
            />
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}

function EntryFields({
  entry,
  setE,
  pic,
}: {
  entry: EntryState;
  setE: (patch: Partial<EntryState>) => void;
  pic: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Entry date">
          <Input
            type="date"
            value={entry.entryDate}
            onChange={(e) => setE({ entryDate: e.target.value })}
            data-testid="entry-date"
          />
          {isStale(entry.entryDate) && (
            <p
              className="text-xs text-amber-600"
              data-testid="stale-date-warning"
            >
              This date is more than 30 days ago — it will still score in that
              week. Double-check it&apos;s intentional.
            </p>
          )}
        </Field>
        <Field label="Category">
          <EnumSelect
            value={entry.category}
            onChange={(v) => setE({ category: v })}
            options={CATEGORIES}
            placeholder="Category"
            testid="category"
          />
        </Field>
      </div>
      <Field label="Progress detail">
        <Textarea
          value={entry.detail}
          onChange={(e) => setE({ detail: e.target.value })}
          data-testid="detail"
          rows={4}
        />
      </Field>
      <Field label="Need follow-up action / unlocking (optional)">
        <Textarea
          value={entry.followUp}
          onChange={(e) => setE({ followUp: e.target.value })}
          data-testid="follow-up"
          rows={2}
        />
      </Field>

      {entry.followUp.trim() && (
        <div className="rounded-md border bg-muted/30 p-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={entry.createActionItem}
              onCheckedChange={(c) => setE({ createActionItem: c === true })}
              data-testid="create-action-item"
            />
            Create an action item from this follow-up
          </label>
          {entry.createActionItem && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Action PIC">
                <Input
                  value={entry.aiPic}
                  placeholder={pic || "Unassigned"}
                  onChange={(e) => setE({ aiPic: e.target.value })}
                />
              </Field>
              <Field label="Due date (optional)">
                <Input
                  type="date"
                  value={entry.aiDueDate}
                  onChange={(e) => setE({ aiDueDate: e.target.value })}
                />
              </Field>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-4">
        <Field label="Link (optional)">
          <Input
            value={entry.linkUrl}
            onChange={(e) => setE({ linkUrl: e.target.value })}
            placeholder="https://…"
          />
        </Field>
        <div className="mt-6 flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={entry.bpOfWeekNominated}
              onCheckedChange={(c) => setE({ bpOfWeekNominated: c === true })}
              data-testid="bp-nominate"
            />
            Best Practice of the Week
            <Badge variant="outline">+2 auto</Badge>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={entry.bestPresenter}
              onCheckedChange={(c) => setE({ bestPresenter: c === true })}
              data-testid="best-presenter"
            />
            Best Presenter of the Week
            <Badge variant="outline">+2 auto</Badge>
          </label>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function EnumSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  testid,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
  disabled?: boolean;
  testid?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => v != null && onChange(v)}
      disabled={disabled}
    >
      <SelectTrigger data-testid={testid}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
