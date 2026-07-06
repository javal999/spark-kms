"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STAGES } from "@/src/lib/enums";

/** Admin stage control. PATCHes the initiative; the server logs stage_changes. */
export function StageControl({
  initiativeId,
  stage,
}: {
  initiativeId: number;
  stage: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function change(next: string | null) {
    if (!next || next === stage) return;
    setPending(true);
    try {
      const res = await fetch(`/api/initiatives/${initiativeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: next }),
      });
      if (!res.ok) {
        toast.error("Could not change stage");
        return;
      }
      toast.success(`Stage → ${next}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Select value={stage} onValueChange={change} disabled={pending}>
      <SelectTrigger className="w-44" data-testid="stage-control">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STAGES.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
