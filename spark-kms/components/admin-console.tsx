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

type Nomination = {
  entryId: number;
  initiativeId: number;
  title: string;
  region: string;
  segment: string;
  entryDate: string;
};

export function NominationsPanel({ nominations }: { nominations: Nomination[] }) {
  const router = useRouter();

  async function confirm(entryId: number) {
    const { ok, data } = await postJSON("/api/admin/nominations/confirm", { entryId });
    if (!ok) return toast.error(data.error ?? "Failed");
    toast.success("Confirmed — +2 Best Practice of the Week");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Best Practice of the Week</CardTitle>
        <CardDescription>Confirm admin nominations to award +2 to the area.</CardDescription>
      </CardHeader>
      <CardContent>
        {nominations.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="no-nominations">
            No pending nominations.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {nominations.map((n) => (
              <li key={n.entryId} className="flex items-center justify-between gap-3 py-3" data-testid={`nomination-${n.entryId}`}>
                <div className="min-w-0">
                  <div className="truncate font-medium">{n.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {n.region} · {n.segment} · {n.entryDate}
                  </div>
                </div>
                <Button size="sm" onClick={() => confirm(n.entryId)} data-testid={`confirm-${n.entryId}`}>
                  Confirm +2
                </Button>
              </li>
            ))}
          </ul>
        )}
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
  // Manual stream
  const [region, setRegion] = useState("");
  const [segment, setSegment] = useState("");
  const [stream, setStream] = useState("presentation");
  const [date, setDate] = useState(todayJakarta());
  // Adjustment
  const [aRegion, setARegion] = useState("");
  const [aSegment, setASegment] = useState("");
  const [aStream, setAStream] = useState("best_practice");
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [aDate, setADate] = useState(todayJakarta());

  async function logStream() {
    if (!region || !segment) return toast.error("Pick an area");
    const { ok, data } = await postJSON("/api/admin/scoring", { region, segment, stream, effectiveDate: date });
    if (!ok) return toast.error(data.error ?? "Failed");
    if (data.status === "skipped") toast.warning("Skipped — presenter cap already used for this area/week");
    else toast.success("Logged");
    router.refresh();
  }

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
        <CardTitle>Weekly points & adjustments</CardTitle>
        <CardDescription>Log presenter/CEE points per area, or post a manual adjustment.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div>
          <h3 className="mb-2 text-sm font-medium">Manual stream</h3>
          <div className="grid items-end gap-3 sm:grid-cols-4">
            <AreaPicker region={region} segment={segment} setRegion={setRegion} setSegment={setSegment} idPrefix="ms" />
            <div className="flex flex-col gap-1">
              <Label>Stream</Label>
              <Select value={stream} onValueChange={(v) => v && setStream(v)}>
                <SelectTrigger data-testid="ms-stream"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="presentation">Presenter (+2, 1/area/week)</SelectItem>
                  <SelectItem value="cee_participation">CEE (+1)</SelectItem>
                  <SelectItem value="cee_best">CEE Best (+2)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Week date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="ms-date" />
            </div>
            <div className="sm:col-span-4"><Button onClick={logStream} data-testid="log-stream">Log points</Button></div>
          </div>
        </div>

        <div className="border-t pt-4">
          <h3 className="mb-2 text-sm font-medium">Adjustment (note required)</h3>
          <div className="grid items-end gap-3 sm:grid-cols-4">
            <AreaPicker region={aRegion} segment={aSegment} setRegion={setARegion} setSegment={setASegment} idPrefix="adj" />
            <div className="flex flex-col gap-1">
              <Label>Stream</Label>
              <Select value={aStream} onValueChange={(v) => v && setAStream(v)}>
                <SelectTrigger data-testid="adj-stream"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="best_practice">Best Practice</SelectItem>
                  <SelectItem value="presenter">Presenter</SelectItem>
                  <SelectItem value="cee">CEE</SelectItem>
                  <SelectItem value="cee_best">CEE Best</SelectItem>
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
        </div>
      </CardContent>
    </Card>
  );
}
