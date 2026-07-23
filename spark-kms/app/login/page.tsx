"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SparkMark } from "@/components/brand";
import { flags } from "@/src/lib/flags";

type Mode = "viewer" | "admin";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [mode, setMode] = useState<Mode>("viewer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const body =
        mode === "admin" ? { email, password } : { password };
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Login failed");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      toast.error("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">
          {mode === "viewer" ? "Sign in to SPARK" : "Admin sign in"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "viewer"
            ? "Enter the shared viewer password to browse the knowledge base."
            : "Use your individual admin account."}
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        {mode === "admin" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <Button
          type="submit"
          disabled={pending}
          data-testid="login-submit"
          className="mt-1"
        >
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <button
        type="button"
        className="mt-6 text-sm text-primary underline-offset-4 hover:underline"
        onClick={() => setMode(mode === "viewer" ? "admin" : "viewer")}
        data-testid="toggle-mode"
      >
        {mode === "viewer" ? "Admin sign in →" : "← Viewer password"}
      </button>

      {flags.tracking && (
        <p className="mt-8 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
          SPARK measures page and feature usage to improve the tool. This is
          aggregated and pseudonymous — no personal identifiers are stored, and
          no one can view another person&apos;s activity. Raw data is deleted
          after 90 days.
        </p>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="grid flex-1 lg:grid-cols-2">
      {/* Brand panel — the product's own surface, not a generic gradient hero. */}
      <div className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2">
          <SparkMark className="size-6 [&_*]:!fill-white" />
          <span className="font-semibold tracking-tight">SPARK</span>
        </div>
        <div className="max-w-md">
          <p className="text-2xl font-semibold leading-snug tracking-tight">
            One place to record and reuse what works — across every region and
            segment.
          </p>
          <p className="mt-3 text-sm text-primary-foreground/70">
            Best practices, unlockings, and the weekly area leaderboard.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/60">
          Paragon Product Business Solutions
        </p>
        {/* faint concentric mark, decorative */}
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-40 top-10 size-96 rounded-full border border-white/5" />
      </div>

      <div className="flex items-center justify-center p-6">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
