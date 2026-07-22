"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  Trophy,
  PlusCircle,
  Settings,
  Share2,
  BarChart3,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SparkMark } from "@/components/brand";
import { flags } from "@/src/lib/flags";
import type { Role } from "@/src/lib/session-config";

type NavLink = {
  href: string;
  label: string;
  minRole: Role;
  icon: LucideIcon;
  flag?: keyof typeof flags;
};

const links: NavLink[] = [
  { href: "/", label: "Dashboard", minRole: "viewer", icon: LayoutDashboard },
  { href: "/initiatives", label: "Initiatives", minRole: "viewer", icon: FolderKanban },
  { href: "/graph", label: "Graph", minRole: "viewer", icon: Share2, flag: "graph" },
  { href: "/leaderboard", label: "Leaderboard", minRole: "viewer", icon: Trophy },
  { href: "/submit", label: "Submit", minRole: "admin", icon: PlusCircle },
  { href: "/insights", label: "Insights", minRole: "admin", icon: BarChart3, flag: "tracking" },
  { href: "/admin", label: "Admin", minRole: "super", icon: Settings },
];

function allowed(role: Role, min: Role): boolean {
  const rank: Record<Role, number> = { viewer: 0, admin: 1, super: 2 };
  return rank[role] >= rank[min];
}

const STORAGE_KEY = "spark-nav-collapsed";

/**
 * v1.2 (item 1): collapsible left sidebar. Expanded shows icon + label; the
 * rail (collapsed) shows icons only. The choice persists in localStorage so it
 * survives navigation and reloads. Rendered by the app-shell layout.
 */
export function Nav({ role, name }: { role: Role; name?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  // Read the persisted preference after mount (avoids an SSR hydration
  // mismatch: the server can't know localStorage, so we start collapsed=false
  // and reconcile on the client). Intentional post-mount setState.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const roleLabel =
    role === "super" ? "Super admin" : role === "admin" ? "Admin" : "Viewer";

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 z-20 flex h-dvh flex-col border-r bg-background/95 backdrop-blur transition-[width] duration-200",
        collapsed ? "w-16" : "w-56",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b px-3",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2">
            <SparkMark className="size-5" />
            <span className="text-[15px] font-semibold tracking-tight">
              SPARK
            </span>
          </Link>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          data-testid="nav-toggle"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {collapsed ? (
            <PanelLeft className="size-5" />
          ) : (
            <PanelLeftClose className="size-5" />
          )}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {links
          .filter((l) => allowed(role, l.minRole) && (!l.flag || flags[l.flag]))
          .map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                data-track={`nav-${l.label.toLowerCase()}`}
                title={collapsed ? l.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
                  collapsed && "justify-center",
                  active
                    ? "bg-primary/10 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{l.label}</span>}
              </Link>
            );
          })}
      </nav>

      <div className="border-t p-2">
        {!collapsed && (
          <div
            className="px-2 pb-2 text-xs text-muted-foreground"
            data-testid="session-role"
          >
            <div>{roleLabel}</div>
            {name && <div className="truncate font-medium text-foreground">{name}</div>}
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={logout}
          title={collapsed ? "Log out" : undefined}
          className={cn("w-full", collapsed && "px-0")}
        >
          <LogOut className="size-4" />
          {!collapsed && <span className="ml-2">Log out</span>}
        </Button>
      </div>
    </aside>
  );
}
