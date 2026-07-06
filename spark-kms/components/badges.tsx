import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Semantic badges. Category and stage each get ONE consistent color meaning
 * (not a per-value rainbow): Best Practice reads positive/blue, Unlocking reads
 * attention/amber. Stage uses a single quiet neutral with a filled dot to show
 * progression, avoiding five loud colors.
 */

export function CategoryBadge({ category }: { category: string }) {
  const unlocking = category === "Unlocking";
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-medium",
        unlocking
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-blue-300 bg-blue-50 text-blue-800",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          unlocking ? "bg-amber-500" : "bg-blue-500",
        )}
      />
      {category}
    </Badge>
  );
}

const STAGE_STEP: Record<string, number> = {
  Idea: 1,
  Pilot: 2,
  Running: 3,
  "Ready to Scale": 4,
};

export function StageBadge({ stage }: { stage: string }) {
  const step = STAGE_STEP[stage] ?? 0;
  return (
    <Badge variant="outline" className="gap-1.5 font-medium text-foreground/80">
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              "h-2.5 w-0.5 rounded-full",
              i <= step ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </span>
      {stage}
    </Badge>
  );
}
