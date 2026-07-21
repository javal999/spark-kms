"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { REGIONS, SEGMENTS } from "@/src/lib/enums";

async function postJSON(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function todayJakarta() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

type Admin = {
  id: number;
  email: string;
  name: string;
  isSuper: boolean;
  active: boolean;
};

export function UsersPanel({ admins }: { admins: Admin[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isSuper, setIsSuper] = useState(false);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const { ok, data } = await postJSON("/api/admin/users", { email, name, password, isSuper });
    setBusy(false);
    if (!ok) return toast.error(data.error ?? "Failed");
    toast.success("Admin created");
    setEmail(""); setName(""); setPassword(""); setIsSuper(false);
    router.refresh();
  }

  async function toggleActive(u: Admin) {
    const { ok, data } = await postJSON(`/api/admin/users/${u.id}`, { active: !u.active }, "PATCH");
    if (!ok) return toast.error(data.error ?? "Failed");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin accounts</CardTitle>
        <CardDescription>Individual admin logins. Super-admins run this console.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Status</th><th /></tr>
            </thead>
            <tbody className="divide-y">
              {admins.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2 font-medium">{u.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                  <td className="px-3 py-2">{u.isSuper ? <Badge>Super</Badge> : <Badge variant="outline">Admin</Badge>}</td>
                  <td className="px-3 py-2">{u.active ? <span className="text-green-700">Active</span> : <span className="text-muted-foreground">Inactive</span>}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(u)}>
                      {u.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="new-admin-name" /></div>
          <div className="flex flex-col gap-1"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="new-admin-email" /></div>
          <div className="flex flex-col gap-1"><Label>Password (8+ chars)</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="new-admin-password" /></div>
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isSuper} onChange={(e) => setIsSuper(e.target.checked)} /> Super-admin
          </label>
        </div>
        <div><Button onClick={create} disabled={busy} data-testid="create-admin">Add admin</Button></div>
      </CardContent>
    </Card>
  );
}

export function ViewerPasswordPanel() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function rotate() {
    setBusy(true);
    const { ok, data } = await postJSON("/api/admin/viewer-password", { password });
    setBusy(false);
    if (!ok) return toast.error(data.error ?? "Failed");
    toast.success("Viewer password rotated — all viewer sessions logged out.");
    setPassword("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Viewer password</CardTitle>
        <CardDescription>Rotating it logs out every current viewer immediately.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-end gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <Label>New viewer password</Label>
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="viewer-password" placeholder="8+ characters" />
        </div>
        <Button onClick={rotate} disabled={busy || password.length < 8} data-testid="rotate-viewer">Rotate</Button>
      </CardContent>
    </Card>
  );
}

type ApiKey = {
  id: number;
  name: string;
  prefix: string;
  scope: "read" | "write";
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function ApiKeysPanel({ apiKeys }: { apiKeys: ApiKey[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null);

  async function create() {
    if (!name.trim()) return toast.error("Name the key");
    setBusy(true);
    const { ok, data } = await postJSON("/api/admin/api-keys", { name: name.trim(), scope });
    setBusy(false);
    if (!ok) return toast.error(data.error ?? "Failed");
    setNewKey({ name: data.name, key: data.key });
    setName("");
    router.refresh();
  }

  async function revoke(k: ApiKey) {
    if (!confirm(`Revoke "${k.name}"? Any integration using it stops working immediately.`)) return;
    const { ok, data } = await postJSON(`/api/admin/api-keys/${k.id}`, {}, "DELETE");
    if (!ok) return toast.error(data.error ?? "Failed");
    toast.success("Key revoked");
    router.refresh();
  }

  const fmt = (s: string | null) =>
    s ? new Date(s).toISOString().slice(0, 10) : "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle>API keys</CardTitle>
        <CardDescription>
          Bearer keys for the integration API and MCP server.{" "}
          <a href="/api/docs" target="_blank" rel="noopener" className="underline">
            API reference
          </a>
          . <span className="font-medium">read</span> keys can query;{" "}
          <span className="font-medium">write</span> keys can also create initiatives and append entries.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {newKey && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-50 p-3 dark:bg-amber-950/20" data-testid="new-api-key">
            <p className="text-sm font-medium">Copy “{newKey.name}” now — it is shown only once.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">{newKey.key}</code>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(newKey.key); toast.success("Copied"); }}>
                Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>Done</Button>
            </div>
          </div>
        )}

        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Prefix</th>
                <th className="px-3 py-2">Scope</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Last used</th>
                <th className="px-3 py-2">Status</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y">
              {apiKeys.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground" data-testid="no-api-keys">No keys yet.</td></tr>
              ) : apiKeys.map((k) => (
                <tr key={k.id} className={k.revokedAt ? "opacity-50" : ""}>
                  <td className="px-3 py-2 font-medium">{k.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{k.prefix}…</td>
                  <td className="px-3 py-2">{k.scope === "write" ? <Badge>write</Badge> : <Badge variant="outline">read</Badge>}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmt(k.createdAt)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmt(k.lastUsedAt)}</td>
                  <td className="px-3 py-2">{k.revokedAt ? <span className="text-muted-foreground">Revoked</span> : <span className="text-green-700">Active</span>}</td>
                  <td className="px-3 py-2 text-right">
                    {!k.revokedAt && (
                      <Button variant="ghost" size="sm" onClick={() => revoke(k)} data-testid={`revoke-key-${k.id}`}>Revoke</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid items-end gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Analytics reader" data-testid="new-key-name" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={(v) => v && setScope(v as "read" | "write")}>
              <SelectTrigger data-testid="new-key-scope"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="read">read (query only)</SelectItem>
                <SelectItem value="write">write (create + append)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Button onClick={create} disabled={busy} data-testid="create-api-key">Create key</Button></div>
        </div>
      </CardContent>
    </Card>
  );
}

function AreaPicker({
  region, segment, setRegion, setSegment, idPrefix,
}: {
  region: string; segment: string; setRegion: (v: string) => void; setSegment: (v: string) => void; idPrefix: string;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label>Region</Label>
        <Select value={region} onValueChange={(v) => v && setRegion(v)}>
          <SelectTrigger data-testid={`${idPrefix}-region`}><SelectValue placeholder="Region" /></SelectTrigger>
          <SelectContent>{REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label>Segment</Label>
        <Select value={segment} onValueChange={(v) => v && setSegment(v)}>
          <SelectTrigger data-testid={`${idPrefix}-segment`}><SelectValue placeholder="Segment" /></SelectTrigger>
          <SelectContent>{SEGMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </>
  );
}

export function ScoringPanel() {
  const router = useRouter();
  const [aRegion, setARegion] = useState("");
  const [aSegment, setASegment] = useState("");
  const [aStream, setAStream] = useState("best_practice");
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [aDate, setADate] = useState(todayJakarta());

  async function adjust() {
    if (!aRegion || !aSegment) return toast.error("Pick an area");
    const { ok, data } = await postJSON("/api/admin/adjustment", {
      region: aRegion, segment: aSegment, stream: aStream, points: Number(points), effectiveDate: aDate, note,
    });
    if (!ok) return toast.error(data.error ?? "Failed");
    toast.success("Adjustment posted");
    setPoints(""); setNote("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adjustments</CardTitle>
        <CardDescription>
          Post a manual score adjustment to an area (note required). Best Practice
          and Best Presenter of the Week are auto-scored at submit — no console needed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid items-end gap-3 sm:grid-cols-4">
          <AreaPicker region={aRegion} segment={aSegment} setRegion={setARegion} setSegment={setASegment} idPrefix="adj" />
          <div className="flex flex-col gap-1">
            <Label>Stream</Label>
            <Select value={aStream} onValueChange={(v) => v && setAStream(v)}>
              <SelectTrigger data-testid="adj-stream"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="best_practice">Best Practice</SelectItem>
                <SelectItem value="presenter">Best Presenter</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Points (±)</Label>
            <Input type="number" value={points} onChange={(e) => setPoints(e.target.value)} data-testid="adj-points" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Week date</Label>
            <Input type="date" value={aDate} onChange={(e) => setADate(e.target.value)} data-testid="adj-date" />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-3">
            <Label>Note (required)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} data-testid="adj-note" placeholder="Why this adjustment?" />
          </div>
          <div className="sm:col-span-4"><Button onClick={adjust} data-testid="post-adjustment">Post adjustment</Button></div>
        </div>
      </CardContent>
    </Card>
  );
}
