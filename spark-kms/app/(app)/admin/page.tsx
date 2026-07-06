import { Button } from "@/components/ui/button";
import { listAdmins, listPendingNominations } from "@/src/services/admin";
import {
  UsersPanel,
  ViewerPasswordPanel,
  NominationsPanel,
  ScoringPanel,
} from "@/components/admin-console";

export default async function AdminPage() {
  const [admins, nominations] = await Promise.all([
    listAdmins(),
    listPendingNominations(),
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
