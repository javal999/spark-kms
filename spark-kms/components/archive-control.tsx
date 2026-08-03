"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Super-admin archive / restore toggle for an initiative (TRD: soft-archive).
 * Archiving hides it from lists, leaderboard, dashboard, graph and duplicate
 * matching; restore brings it back. Guarded server-side by requireSuper.
 */
export function ArchiveControl({
  id,
  archived,
}: {
  id: number;
  archived: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    if (
      !archived &&
      !window.confirm(
        "Archive this initiative? It will be hidden from lists, the leaderboard, and the graph. Its history is kept and you can restore it later.",
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/initiatives/${id}/archive`, {
      method: archived ? "DELETE" : "POST",
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Couldn't update");
      return;
    }
    toast.success(archived ? "Initiative restored" : "Initiative archived");
    router.refresh();
  }

  return (
    <Button
      variant={archived ? "default" : "outline"}
      size="sm"
      onClick={go}
      disabled={busy}
      data-testid="archive-toggle"
    >
      {busy ? "…" : archived ? "Restore initiative" : "Archive initiative"}
    </Button>
  );
}
