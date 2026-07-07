import { Button } from "@/components/ui/button";
import { listAdmins, listPendingNominations } from "@/src/services/admin";
import { listApiKeys } from "@/src/services/apiKeys";
import {
  UsersPanel,
  ViewerPasswordPanel,
  NominationsPanel,
  ScoringPanel,
  ApiKeysPanel,
} from "@/components/admin-console";

export default async function AdminPage() {
  const [admins, nominations, apiKeys] = await Promise.all([
    listAdmins(),
    listPendingNominations(),
    listApiKeys(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Weekly scoring console, admin accounts, and settings.
        </p>
      </div>

      <NominationsPanel
        nominations={nominations.map((n) => ({
          entryId: n.entryId,
          initiativeId: n.initiativeId,
          title: n.title,
          region: n.region,
          segment: n.segment,
          entryDate: n.entryDate,
        }))}
      />
      <ScoringPanel />
      <UsersPanel admins={admins} />
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
      <ViewerPasswordPanel />

      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">Bulk upload template</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The versioned Excel template, generated from the current enum config.
        </p>
        <a href="/api/upload/template" download className="mt-3 inline-block">
          <Button variant="outline" type="button">
            Download template
          </Button>
        </a>
      </div>
    </div>
  );
}
