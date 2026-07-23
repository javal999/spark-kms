import { Button } from "@/components/ui/button";
import { listAdmins } from "@/src/services/admin";
import { listApiKeys } from "@/src/services/apiKeys";
import { listPeople } from "@/src/services/people";
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
];

export default async function AdminPage() {
  const [admins, apiKeys, people] = await Promise.all([
    listAdmins(),
    listApiKeys(),
    listPeople(),
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

      {/* Lets the last sections scroll up under the sticky bars when jumped to. */}
      <div aria-hidden className="h-[45vh]" />
    </div>
  );
}
