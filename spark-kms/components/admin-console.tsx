"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
        <CardDescription>
          Password / break-glass accounts. Microsoft SSO users are managed under
          Access (SSO), not here.
        </CardDescription>
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

/**
 * Phase 9: embed the corpus + regenerate AI link suggestions. Uses the cloud
 * embedder when OPENROUTER_API_KEY is set (costs per initiative), else the stub.
 */
export function AiLinksPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    embedded: number;
    suggestionsCreated: number;
    model: string;
  } | null>(null);

  async function refresh() {
    setBusy(true);
    const { ok, data } = await postJSON("/api/admin/ai-links/refresh", {});
    setBusy(false);
    if (!ok) return toast.error(data.error ?? "Failed");
    setResult(data);
    toast.success(`Embedded ${data.embedded} · ${data.suggestionsCreated} new suggestions`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI connections</CardTitle>
        <CardDescription>
          Embed every initiative, then suggest semantically-similar links for
          admins to confirm on each detail page. Suggestions are never
          auto-linked.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <Button onClick={refresh} disabled={busy} data-testid="refresh-ai-links">
            {busy ? "Working…" : "Embed + refresh suggestions"}
          </Button>
        </div>
        {result && (
          <p className="text-sm text-muted-foreground">
            Embedded {result.embedded} initiatives with{" "}
            <span className="font-mono">{result.model}</span> ·{" "}
            {result.suggestionsCreated} new suggestions.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

type Person = { id: number; name: string; active: boolean };

/**
 * v1.2 (item 2, D9): PIC people directory management. Bulk-add names (paste one
 * per line) and activate/deactivate. Names, not logins — the Submit picker
 * autocompletes from the active set.
 */
export function PeoplePanel({ people }: { people: Person[] }) {
  const router = useRouter();
  const [names, setNames] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const parsed = names
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parsed.length === 0) return toast.error("Enter at least one name");
    setBusy(true);
    const { ok, data } = await postJSON("/api/admin/people", { names: parsed });
    setBusy(false);
    if (!ok) return toast.error(data.error ?? "Failed");
    toast.success(`${data.added} added · ${data.total} in directory`);
    setNames("");
    router.refresh();
  }

  async function toggle(p: Person) {
    const { ok, data } = await postJSON(
      "/api/admin/people",
      { id: p.id, active: !p.active },
      "PATCH",
    );
    if (!ok) return toast.error(data.error ?? "Failed");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>PIC directory</CardTitle>
        <CardDescription>
          Field-person names for the Submit picker. Not login accounts. Typing a
          new name on Submit also adds it here.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Add names (one per line)</Label>
          <Textarea
            value={names}
            onChange={(e) => setNames(e.target.value)}
            rows={4}
            placeholder={"Sri Rahayu\nBudi Santoso"}
            data-testid="people-names"
          />
          <div>
            <Button onClick={add} disabled={busy} data-testid="add-people">
              Add to directory
            </Button>
          </div>
        </div>

        {people.length > 0 && (
          <div
            className={`rounded-lg border${
              // Cap the visible list to ~10 rows; scroll the rest (sticky header).
              people.length > 10 ? " max-h-[22rem] overflow-y-auto" : ""
            }`}
          >
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {people.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2">
                      {p.active ? (
                        <span className="text-green-700">Active</span>
                      ) : (
                        <span className="text-muted-foreground">Inactive</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggle(p)}
                      >
                        {p.active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

// ── Access (M365 SSO) — the allow-list: who may sign in + at what role ───────
type AccessUser = {
  id: number;
  email: string;
  name: string;
  role: "viewer" | "admin" | "super";
  active: boolean;
  lastLoginAt: string | null;
};

const ROLE_LABEL: Record<AccessUser["role"], string> = {
  viewer: "Viewer",
  admin: "Admin",
  super: "Super-admin",
};

/**
 * TRD-2026-009 E6. Super-admin manages the SSO allow-list: add an email, set its
 * role, deactivate. Everyone listed signs in with Microsoft; viewers read only.
 */
export function AccessPanel({ users }: { users: AccessUser[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AccessUser["role"]>("viewer");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!email.trim()) return toast.error("Enter an email");
    setBusy(true);
    const { ok, data } = await postJSON("/api/admin/access", {
      email: email.trim(),
      role,
    });
    setBusy(false);
    if (!ok) return toast.error(data.error ?? "Couldn't add user");
    toast.success(`${data.user.email} set to ${ROLE_LABEL[data.user.role as AccessUser["role"]]}`);
    setEmail("");
    router.refresh();
  }

  async function changeRole(u: AccessUser, newRole: string) {
    const { ok, data } = await postJSON("/api/admin/access", {
      email: u.email,
      role: newRole,
    });
    if (!ok) return toast.error(data.error ?? "Couldn't change role");
    router.refresh();
  }

  async function toggle(u: AccessUser) {
    const { ok, data } = await postJSON(
      "/api/admin/access",
      { id: u.id, active: !u.active },
      "PATCH",
    );
    if (!ok) return toast.error(data.error ?? "Couldn't update");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Access (M365 SSO)</CardTitle>
        <CardDescription>
          Who can sign in and at what role. Everyone here signs in with their
          Microsoft account; viewers can only read. Deactivating blocks new
          sign-ins and privileged actions immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="access-email">Email</Label>
            <Input
              id="access-email"
              type="email"
              placeholder="name@paragon-innovation.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-72"
              data-testid="access-email"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AccessUser["role"])}>
              <SelectTrigger className="w-36" data-testid="access-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="super">Super-admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} disabled={busy} data-testid="access-add">
            Add / update
          </Button>
        </div>

        {users.length > 0 && (
          <div
            className={`rounded-lg border${
              users.length > 10 ? " max-h-[24rem] overflow-y-auto" : ""
            }`}
          >
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Last login</th>
                  <th className="px-3 py-2">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u) => (
                  <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                    <td className="px-3 py-2 font-medium">{u.email}</td>
                    <td className="px-3 py-2">
                      <Select value={u.role} onValueChange={(v) => v && changeRole(u, v)}>
                        <SelectTrigger className="h-7 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="super">Super-admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {u.lastLoginAt ? u.lastLoginAt.slice(0, 10) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {u.active ? (
                        <span className="text-green-700">Active</span>
                      ) : (
                        <span className="text-muted-foreground">Inactive</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => toggle(u)}>
                        {u.active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
