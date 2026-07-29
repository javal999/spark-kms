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

/** Microsoft's four-square mark (brand-correct colours). */
function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 23 23" className="size-4" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const denied = params.get("denied") === "1";
  const err = params.get("e");
  const ref = params.get("ref");
  const [mode, setMode] = useState<Mode>("viewer");
  // With SSO on, the password form is tucked behind "Use a password instead".
  const [showPassword, setShowPassword] = useState(!flags.sso);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const body = mode === "admin" ? { email, password } : { password };
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

  // Callback outcomes are surfaced as a banner (redirects carry ?denied / ?e / ?ref).
  const banner = denied
    ? "The Microsoft account you signed in with isn't authorized for SPARK yet. Ask a SPARK admin to add you."
    : err === "rate"
      ? "Too many attempts. Please wait a few minutes, then try again."
      : err
        ? `Sign-in didn't complete. Please try again${ref ? ` (ref ${ref})` : ""}.`
        : null;

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">Sign in to SPARK</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {flags.sso
            ? "Use your Microsoft account to access the knowledge base."
            : "Enter the shared viewer password to browse the knowledge base."}
        </p>
      </div>

      {banner && (
        <div
          className={`mb-4 rounded-md border p-3 text-sm ${
            denied
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-red-300 bg-red-50 text-red-900"
          }`}
          role="alert"
        >
          {banner}
        </div>
      )}

      {flags.sso && (
        <a
          href={`/api/auth/sso/start?next=${encodeURIComponent(next)}`}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border bg-card text-sm font-medium transition-colors hover:bg-accent"
          data-testid="sso-signin"
        >
          <MicrosoftLogo />
          Sign in with Microsoft
        </a>
      )}

      {flags.sso && !showPassword && (
        <button
          type="button"
          onClick={() => setShowPassword(true)}
          className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Use a password instead
        </button>
      )}

      {(!flags.sso || showPassword) && (
        <>
          {flags.sso && (
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              password sign-in
              <span className="h-px flex-1 bg-border" />
            </div>
          )}

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
              <Label htmlFor="password">
                {mode === "admin" ? "Admin password" : "Shared viewer password"}
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={pending} data-testid="login-submit" className="mt-1">
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
        </>
      )}

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
