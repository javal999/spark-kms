"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  failureMessage,
  networkMessage,
  validateUploadFile,
  errorReportCsv,
  type UploadMessage,
} from "@/src/lib/upload-errors";

function showError(m: UploadMessage) {
  toast.error(m.title, m.description ? { description: m.description } : undefined);
}

type Candidate = { id: number; title: string; region: string; segment: string; similarity: number };
type PreviewRow = {
  rowNumber: number;
  status: "new" | "duplicate" | "error";
  errors: string[];
  candidates: Candidate[];
  summary: { title: string; region: string; segment: string; category: string; entryDate: string };
};
type Preview = {
  batchId: number;
  templateOutdated: boolean;
  templateVersion: string | null;
  counts: { total: number; valid: number; duplicate: number; error: number };
  rows: PreviewRow[];
};
type Choice = { action: "new" | "append"; initiativeId?: number };

export function BulkUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; appended: number } | null>(null);
  // v1.2 (item 8): acknowledgment gate before committing a batch with duplicates.
  const [ackOpen, setAckOpen] = useState(false);
  const [ack, setAck] = useState(false);

  function reset() {
    setFile(null);
    setPreview(null);
    setChoices({});
    setResult(null);
    setAckOpen(false);
    setAck(false);
  }

  async function onFile(f: File) {
    // Instant, actionable feedback before touching the network.
    const badFile = validateUploadFile(f.name, f.size);
    if (badFile) {
      showError(badFile);
      return;
    }

    setFile(f);
    setPreview(null);
    setResult(null);
    setChoices({});
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/upload/preview", { method: "POST", body: fd });
      if (!res.ok) {
        showError(await failureMessage(res, "read"));
        return;
      }
      const data = await res.json();
      setPreview(data);
      // Pre-seed non-duplicate rows; duplicates must be resolved explicitly.
      const seed: Record<number, Choice> = {};
      for (const r of data.rows as PreviewRow[]) {
        if (r.status === "new") seed[r.rowNumber] = { action: "new" };
      }
      setChoices(seed);
    } catch {
      toast.error("Network error");
    } finally {
      setBusy(false);
    }
  }

  const errorRows = preview?.rows.filter((r) => r.status === "error") ?? [];
  const duplicateRows = preview?.rows.filter((r) => r.status === "duplicate") ?? [];
  const unresolved = duplicateRows.filter((r) => !choices[r.rowNumber]);
  const canCommit =
    !!preview && errorRows.length === 0 && unresolved.length === 0 && !busy;

  // v1.2 (item 8): batch-resolve every duplicate at once. `pick` returns the
  // choice for a row, or undefined to clear it.
  function setAllDuplicates(pick: (r: PreviewRow) => Choice | undefined) {
    setChoices((prev) => {
      const next = { ...prev };
      for (const r of duplicateRows) {
        const c = pick(r);
        if (c) next[r.rowNumber] = c;
        else delete next[r.rowNumber];
      }
      return next;
    });
  }
  const appendAllClosest = () =>
    setAllDuplicates((r) =>
      r.candidates[0]
        ? { action: "append", initiativeId: r.candidates[0].id }
        : { action: "new" },
    );
  const createAllAsNew = () => setAllDuplicates(() => ({ action: "new" }));

  // For a file with many bad rows, a scrolling table is hard to act on — offer a
  // downloadable error report (CSV, opens in Excel). The CSV is built by a pure,
  // unit-tested helper; here we only wrap it in a browser download.
  function downloadErrorReport() {
    const url = URL.createObjectURL(
      new Blob([errorReportCsv(errorRows)], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "spark-upload-errors.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  const clearDuplicateChoices = () => setAllDuplicates(() => undefined);

  // How each duplicate row is currently resolved (for the ack summary).
  const dupAppend = duplicateRows.filter(
    (r) => choices[r.rowNumber]?.action === "append",
  ).length;
  const dupNew = duplicateRows.filter(
    (r) => choices[r.rowNumber]?.action === "new",
  ).length;

  // Duplicates demand an explicit acknowledgment; a clean batch commits directly.
  function requestCommit() {
    if (!canCommit) return;
    if (duplicateRows.length > 0) {
      setAck(false);
      setAckOpen(true);
    } else {
      void commit();
    }
  }

  async function commit() {
    if (!file || !preview) return;
    setAckOpen(false);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("choices", JSON.stringify(
        Object.fromEntries(Object.entries(choices).map(([k, v]) => [k, v])),
      ));
      const res = await fetch("/api/upload/commit", { method: "POST", body: fd });
      if (!res.ok) {
        showError(await failureMessage(res, "import"));
        return;
      }
      const data = await res.json();
      setResult({ created: data.created, appended: data.appended });
      toast.success(`Imported ${data.created + data.appended} rows`);
      router.refresh();
    } catch {
      showError(networkMessage());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk upload</CardTitle>
        <CardDescription>
          Import many entries from the Excel template. You&apos;ll preview every
          row before anything is saved.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <a href="/api/upload/template" download>
            <Button variant="outline" type="button">
              Download template
            </Button>
          </a>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              data-testid="upload-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <span className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              {busy && !preview ? "Reading…" : "Choose .xlsx file"}
            </span>
          </label>
          {file && (
            <span className="text-sm text-muted-foreground">{file.name}</span>
          )}
          {preview && (
            <Button variant="ghost" size="sm" onClick={reset}>
              Clear
            </Button>
          )}
        </div>

        {result && (
          <div
            className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900"
            data-testid="commit-result"
          >
            ✓ Imported successfully — {result.created} new initiatives,{" "}
            {result.appended} appended entries.
          </div>
        )}

        {preview && !result && (
          <>
            {preview.templateOutdated && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                This file was made with an older template
                {preview.templateVersion ? ` (${preview.templateVersion})` : ""}.
                It will still import — download the latest template next time.
              </div>
            )}

            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">{preview.counts.total} rows</Badge>
              <Badge className="bg-blue-100 text-blue-900">{preview.counts.valid} new</Badge>
              <Badge className="bg-amber-100 text-amber-900">{preview.counts.duplicate} duplicate</Badge>
              {preview.counts.error > 0 && (
                <Badge className="bg-red-100 text-red-900">{preview.counts.error} error</Badge>
              )}
            </div>

            {errorRows.length > 0 && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                Fix the {errorRows.length} error row(s) in your file and re-upload
                — nothing can be imported while any row has an error.
                {errorRows.length > 10 && (
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={downloadErrorReport}
                    >
                      Download error list ({errorRows.length}) — CSV
                    </Button>
                  </div>
                )}
              </div>
            )}

            {duplicateRows.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3">
                <span className="text-sm text-amber-900">
                  {duplicateRows.length} possible duplicate
                  {duplicateRows.length === 1 ? "" : "s"} — resolve individually
                  or in bulk:
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={appendAllClosest}
                  data-testid="dup-append-all"
                >
                  Append each to closest match
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={createAllAsNew}
                  data-testid="dup-all-new"
                >
                  Create all as new
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDuplicateChoices}
                  data-testid="dup-clear"
                >
                  Reset choices
                </Button>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Topic</th>
                    <th className="px-3 py-2">Area</th>
                    <th className="px-3 py-2">Status / resolution</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.rows.map((r) => (
                    <tr key={r.rowNumber} data-testid={`preview-row-${r.rowNumber}`}>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {r.rowNumber}
                      </td>
                      <td className="px-3 py-2">{r.summary.title || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.summary.region} · {r.summary.segment}
                      </td>
                      <td className="px-3 py-2">
                        {r.status === "error" && (
                          <span className="text-red-700">
                            {r.errors.join("; ")}
                          </span>
                        )}
                        {r.status === "new" && (
                          <Badge variant="outline" className="text-blue-700">
                            New topic
                          </Badge>
                        )}
                        {r.status === "duplicate" && (
                          <select
                            data-testid={`resolve-${r.rowNumber}`}
                            className={cn(
                              "rounded-md border px-2 py-1 text-sm",
                              !choices[r.rowNumber] && "border-amber-400 bg-amber-50",
                            )}
                            value={
                              choices[r.rowNumber]
                                ? choices[r.rowNumber].action === "new"
                                  ? "new"
                                  : `append:${choices[r.rowNumber].initiativeId}`
                                : ""
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              setChoices((prev) => ({
                                ...prev,
                                [r.rowNumber]:
                                  v === "new"
                                    ? { action: "new" }
                                    : v === ""
                                      ? undefined!
                                      : { action: "append", initiativeId: Number(v.split(":")[1]) },
                              }));
                            }}
                          >
                            <option value="">Choose…</option>
                            <option value="new">Create as new topic</option>
                            {r.candidates.map((c) => (
                              <option key={c.id} value={`append:${c.id}`}>
                                Append to #{c.id} — {c.title.slice(0, 40)} (
                                {Math.round(c.similarity * 100)}%)
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={requestCommit}
                disabled={!canCommit}
                data-testid="commit-upload"
              >
                {busy ? "Importing…" : "Commit import"}
              </Button>
              {unresolved.length > 0 && (
                <span className="text-sm text-amber-700">
                  Resolve {unresolved.length} duplicate row(s) first.
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>

      {/* v1.2 (item 8): mandatory acknowledgment before importing duplicates. */}
      <Dialog open={ackOpen} onOpenChange={setAckOpen}>
        <DialogContent data-testid="dup-ack-dialog">
          <DialogHeader>
            <DialogTitle>Confirm duplicate resolution</DialogTitle>
            <DialogDescription>
              This batch has {duplicateRows.length} row
              {duplicateRows.length === 1 ? "" : "s"} that look like existing
              initiatives. Appends add an entry to an existing topic; this cannot
              be undone in bulk.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div>
              <span className="font-medium">{dupAppend}</span> appended to an
              existing initiative
            </div>
            <div>
              <span className="font-medium">{dupNew}</span> created as a new topic
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              data-testid="dup-ack-checkbox"
              className="mt-0.5"
            />
            I&apos;ve reviewed how each duplicate row is resolved.
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAckOpen(false)}>
              Back
            </Button>
            <Button
              onClick={commit}
              disabled={!ack || busy}
              data-testid="dup-ack-confirm"
            >
              {busy ? "Importing…" : "Confirm import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
