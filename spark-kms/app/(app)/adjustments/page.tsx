import { ScoringPanel } from "@/components/admin-console";
import { jakartaDate } from "@/src/services/week";

/**
 * Manual score adjustments (admin or super — D24; the rest of /admin stays
 * super-only). Every adjustment needs a note and is attributed to whoever
 * posted it. The perimeter is enforced in proxy.ts and again in the route
 * handler by requireAdmin().
 */
export default function AdjustmentsPage() {
  // Jakarta "today" as the default effective date — server-side only
  // (CLAUDE.md), because it lands on a score event.
  const today = jakartaDate(new Date());
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Adjustments</h1>
        <p className="text-sm text-muted-foreground">
          Correct an area&apos;s score by hand. Every adjustment needs a note and
          is recorded against your account.
        </p>
      </div>
      <ScoringPanel today={today} />
    </div>
  );
}
