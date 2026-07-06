"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SparkMark } from "@/components/brand";
import type { Role } from "@/src/lib/session-config";

const links: { href: string; label: string; minRole: Role }[] = [
  { href: "/", label: "Dashboard", minRole: "viewer" },
  { href: "/initiatives", label: "Initiatives", minRole: "viewer" },
  { href: "/leaderboard", label: "Leaderboard", minRole: "viewer" },
  { href: "/submit", label: "Submit", minRole: "admin" },
  { href: "/admin", label: "Admin", minRole: "super" },
];

function allowed(role: Role, min: Role): boolean {
  const rank: Record<Role, number> = { viewer: 0, admin: 1, super: 2 };
  return rank[role] >= rank[min];
}

export function Nav({ role, name }: { role: Role; name?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const roleLabel =
    role === "super" ? "Super admin" : role === "admin" ? "Admin" : "Viewer";

  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2">
          <SparkMark className="size-5" />
          <span className="text-[15px] font-semibold tracking-tight">
            SPARK
          </span>
        </Link>
        <nav className="flex items-center gap-0.5">
          {links
            .filter((l) => allowed(role, l.minRole))
            .map((l) => {
              const active =
                l.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "relative rounded-md px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l.label}
                  {active && (
                    <span className="absolute inset-x-3 -bottom-[7px] h-0.5 rounded-full bg-primary" />
                  )}
                </Link>
              );
            })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span
            className="hidden items-center gap-2 text-sm sm:flex"
            data-testid="session-role"
          >
            <span className="text-muted-foreground">{roleLabel}</span>
            {name && (
              <>
                <span className="text-border">·</span>
                <span className="font-medium">{name}</span>
              </>
            )}
          </span>
          <Button variant="outline" size="sm" onClick={logout}>
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
