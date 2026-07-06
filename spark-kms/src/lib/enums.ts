/**
 * Client-safe copies of the DB enum value lists (for form dropdowns and filter
 * UIs). Kept in sync with `src/db/schema.ts` by a unit test (enums.test.ts) so
 * they can never silently drift.
 */
export const REGIONS = [
  "Jakarta Greater",
  "Kalimantan",
  "Sumatera",
  "CJWJ",
  "EJBN",
] as const;

export const SEGMENTS = ["Halal PC", "Teen & ES", "Masstige", "All"] as const;

export const PILLARS = [
  "Social Buzz",
  "Personalized CRM",
  "Relevant Beauty Lifestyle",
  "Activated New Touchpoint",
  "Key Territory Execution",
] as const;

export const CATEGORIES = ["Best Practice", "Unlocking"] as const;

export const STAGES = ["Idea", "Pilot", "Running", "Ready to Scale"] as const;

export const ACTION_STATUSES = [
  "Not Started",
  "On Progress",
  "Done",
  "Withdrawn/Cancelled",
] as const;

export type Region = (typeof REGIONS)[number];
export type Segment = (typeof SEGMENTS)[number];
export type Pillar = (typeof PILLARS)[number];
export type Category = (typeof CATEGORIES)[number];
export type Stage = (typeof STAGES)[number];
export type ActionStatus = (typeof ACTION_STATUSES)[number];
