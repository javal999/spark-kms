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
import { ACTION_STATUSES } from "@/src/lib/enums";

/** Inline action-item status update (admin). */
export function ActionItemStatus({
  id,
  status,
}: {
  id: number;
  status: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function change(next: string | null) {
    if (!next || next === status) return;
    setPending(true);
    try {
      const res = await fetch(`/api/action-items/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        toast.error("Could not update status");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Select value={status} onValueChange={change} disabled={pending}>
      <SelectTrigger className="h-8 w-40" data-testid={`ai-status-${id}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ACTION_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
