import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listAdmins } from "@/src/services/admin";
import { listApiKeys } from "@/src/services/apiKeys";
import { listPeople } from "@/src/services/people";
import { listRecentErrors, listRecentSlowRequests } from "@/src/services/errors";
import { listAuthorized } from "@/src/services/authorized-users";
import { listInitiatives } from "@/src/services/initiatives";
import {
  UsersPanel,
  PeoplePanel,
  AiLinksPanel,
  ViewerPasswordPanel,
  ApiKeysPanel,
  AccessPanel,
} from "@/components/admin-console";
import { AdminSectionNav, type AdminSection } from "@/components/admin-section-nav";
import { flags } from "@/src/lib/flags";

// D24: Adjustments moved to its own admin-reachable page (/adjustments), since
// /admin/* stays super-only. It is no longer a section here.
const SECTIONS: AdminSection[] = [
  { id: "admins", label: "Admins" },
  ...(flags.sso ? [{ id: "access", label: "Access (SSO)" }] : []),
  { id: "people", label: "PIC directory" },
  ...(flags.graph ? [{ id: "ai-links", label: "AI connections" }] : []),
  { id: "api-keys", label: "API keys" },
  { id: "viewer-password", label: "Viewer password" },
  { id: "template", label: "Template" },
  { id: "archived", label: "Archived" },
  { id: "errors", label: "Error log" },
  { id: "slow", label: "Slow requests" },
];

export default async function AdminPage() {
  const [admins, apiKeys, people, recentErrors, authorized, slowReqs] =
    await Promise.all([
      listAdmins(),
      listApiKeys(),
      listPeople(),
      listRecentErrors(50),
      flags.sso ? listAuthorized() : Promise.resolve([]),
      listRecentSlowRequests(50),
    ]);
  const archivedList = await listInitiatives({ archived: "archived", pageSize: 100 });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Weekly scoring console, admin accounts, and settings.
        </p>
      </div>

      <Link
        href="/admin/overview"
        className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
      >
        <div className="text-sm font-medium">System overview →</div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          How SPARK is built and behaves — data model, auth, scoring,
          observability, archive, deploy. For super-admins and engineer handover.
        </p>
      </Link>

      <AdminSectionNav sections={SECTIONS} />

      <Link
        href="/adjustments"
        className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
      >
        <div className="text-sm font-medium">Adjustments →</div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manual score corrections. Open to any admin since D24, so it lives
          outside this super-only page.
        </p>
      </Link>
      <section id="admins" className="scroll-mt-28">
        <UsersPanel admins={admins} />
      </section>
      {flags.sso && (
        <section id="access" className="scroll-mt-28">
          <AccessPanel
            users={authorized.map((u) => ({
              id: u.id,
              email: u.email,
              name: u.name,
              role: u.role,
              active: u.active,
              lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
            }))}
          />
        </section>
      )}
      <section id="people" className="scroll-mt-28">
        <PeoplePanel people={people} />
      </section>
      {flags.graph && (
        <section id="ai-links" className="scroll-mt-28">
          <AiLinksPanel />
        </section>
      )}
      <section id="api-keys" className="scroll-mt-28">
        <ApiKeysPanel
          apiKeys={apiKeys.map((k) => ({
            id: k.id,
            name: k.name,
            prefix: k.prefix,
            scope: k.scope,
            createdAt: k.createdAt.toISOString(),
            lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
            revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
          }))}
        />
      </section>
      <section id="viewer-password" className="scroll-mt-28">
        <ViewerPasswordPanel />
      </section>

      <section id="template" className="scroll-mt-28 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">Bulk upload template</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The versioned Excel template, generated from the current enum config.
        </p>
        <a href="/api/upload/template" download className="mt-3 inline-block">
          <Button variant="outline" type="button">
            Download template
          </Button>
        </a>
      </section>

      <section id="archived" className="scroll-mt-28 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">Archived initiatives</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hidden from lists, leaderboard, dashboard, and graph. Open one to
          restore it.
        </p>
        {archivedList.rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nothing archived.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Initiative</th>
                  <th className="py-2 pr-3 font-medium">Area</th>
                  <th className="py-2 pr-3 font-medium">Stage</th>
                </tr>
              </thead>
              <tbody>
                {archivedList.rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <Link
                        href={`/initiatives/${r.id}`}
                        className="text-primary hover:underline"
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          #{r.id}
                        </span>{" "}
                        {r.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {r.region} · {r.segment}
                    </td>
                    <td className="py-2 pr-3">{r.stage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="errors" className="scroll-mt-28 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">Error log</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The most recent server errors captured across instrumented routes
          (e.g. bulk upload). Match a user-reported <code>ref err_…</code> to a
          row here to see the exact message.
        </p>
        {recentErrors.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No errors captured. 🎉
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">When (UTC)</th>
                  <th className="py-2 pr-3 font-medium">Trace</th>
                  <th className="py-2 pr-3 font-medium">Route</th>
                  <th className="py-2 pr-3 font-medium">Error</th>
                  <th className="py-2 pr-3 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {recentErrors.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                      {e.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{e.traceId}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{e.route}</td>
                    <td className="py-2 pr-3">
                      <span className="font-medium">{e.name}</span>: {e.message}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{e.actorId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="slow" className="scroll-mt-28 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">Slow requests</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Instrumented requests that took over 5s (e.g. large bulk uploads).
          Watch this trend up — it&apos;s the early warning before a request hits
          the ~60s gateway timeout.
        </p>
        {slowReqs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing slow lately. 🎉
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">When (UTC)</th>
                  <th className="py-2 pr-3 font-medium">Route</th>
                  <th className="py-2 pr-3 font-medium">Duration</th>
                  <th className="py-2 pr-3 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {slowReqs.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                      {s.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{s.route}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {(s.ms / 1000).toFixed(1)}s
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {s.meta ? JSON.stringify(s.meta) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Lets the last sections scroll up under the sticky bars when jumped to. */}
      <div aria-hidden className="h-[45vh]" />
    </div>
  );
}
