import { Button } from "@/components/ui/button";
import { listAdmins } from "@/src/services/admin";
import { listApiKeys } from "@/src/services/apiKeys";
import { listPeople } from "@/src/services/people";
import { listRecentErrors } from "@/src/services/errors";
import {
  UsersPanel,
  PeoplePanel,
  AiLinksPanel,
  ViewerPasswordPanel,
  ScoringPanel,
  ApiKeysPanel,
} from "@/components/admin-console";
import { AdminSectionNav, type AdminSection } from "@/components/admin-section-nav";
import { flags } from "@/src/lib/flags";

const SECTIONS: AdminSection[] = [
  { id: "scoring", label: "Adjustments" },
  { id: "admins", label: "Admins" },
  { id: "people", label: "PIC directory" },
  ...(flags.graph ? [{ id: "ai-links", label: "AI connections" }] : []),
  { id: "api-keys", label: "API keys" },
  { id: "viewer-password", label: "Viewer password" },
  { id: "template", label: "Template" },
  { id: "errors", label: "Error log" },
];

export default async function AdminPage() {
  const [admins, apiKeys, people, recentErrors] = await Promise.all([
    listAdmins(),
    listApiKeys(),
    listPeople(),
    listRecentErrors(50),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Weekly scoring console, admin accounts, and settings.
        </p>
      </div>

      <AdminSectionNav sections={SECTIONS} />

      <section id="scoring" className="scroll-mt-28">
        <ScoringPanel />
      </section>
      <section id="admins" className="scroll-mt-28">
        <UsersPanel admins={admins} />
      </section>
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

      {/* Lets the last sections scroll up under the sticky bars when jumped to. */}
      <div aria-hidden className="h-[45vh]" />
    </div>
  );
}
