/**
 * Feature flags (Phase 7: graph + tracking). Both ship OFF and stay dark until
 * explicitly enabled — nothing renders or emits with the flag off (TRD §7,
 * tasks Rule 5). NEXT_PUBLIC_* so the client emitter and server both read them.
 *
 *   NEXT_PUBLIC_FEATURE_GRAPH=1     related panel + /graph explorer
 *   NEXT_PUBLIC_FEATURE_TRACKING=1  usage emitter + /api/events + dashboard
 */
export const flags = {
  graph: process.env.NEXT_PUBLIC_FEATURE_GRAPH === "1",
  tracking: process.env.NEXT_PUBLIC_FEATURE_TRACKING === "1",
} as const;

export type FeatureFlags = typeof flags;
