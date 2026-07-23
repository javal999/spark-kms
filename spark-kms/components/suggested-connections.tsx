"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Suggestion = { edgeId: number; otherId: number; title: string; score: number };

/**
 * AI-suggested connections (Phase 9). Admin-only. Each suggestion can be
 * confirmed (→ a real link) or dismissed. Never auto-links.
 */
export function SuggestedConnections({
  initiativeId,
  suggestions,
}: {
  initiativeId: number;
  suggestions: Suggestion[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);

  if (suggestions.length === 0) return null;

  async function act(edgeId: number, action: "confirm" | "dismiss") {
    setBusy(edgeId);
    const res = await fetch(`/api/initiatives/${initiativeId}/suggestions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ edgeId, action }),
    });
    setBusy(null);
    if (!res.ok) {
      toast.error("Could not update the suggestion");
      return;
    }
    toast.success(action === "confirm" ? "Linked" : "Dismissed");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-violet-300/60 bg-violet-50/40 p-3 dark:bg-violet-950/20">
      <div className="text-sm font-medium">Suggested connections · AI</div>
      <ul className="flex flex-col divide-y">
        {suggestions.map((s) => (
          <li key={s.edgeId} className="flex items-center gap-2 py-1.5 text-sm">
            <Link
              href={`/initiatives/${s.otherId}`}
              className="flex-1 truncate hover:underline"
            >
              {s.title}
            </Link>
            <Badge variant="outline" className="tabular-nums">
              {Math.round(s.score * 100)}%
            </Badge>
            <Button
              size="sm"
              variant="outline"
              disabled={busy === s.edgeId}
              onClick={() => act(s.edgeId, "confirm")}
            >
              Link
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy === s.edgeId}
              onClick={() => act(s.edgeId, "dismiss")}
            >
              Dismiss
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
