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
  "Sulawesi",
] as const;

export const SEGMENTS = ["Halal PC", "Teen & ES", "Masstige", "All"] as const;

export const PILLARS = [
  "Social Buzz",
  "Personalized CRM",
  "Relevant Beauty Lifestyle",
  "Activated New Touchpoint",
  "Key Territory Execution",
  // D32: stored as the full name. The "CEE" abbreviation it replaced is still
  // accepted as INPUT everywhere — see PILLAR_INPUT_ALIASES below.
  "Core Excellence Execution", // v1.2 (D10), renamed D32
] as const;

/**
 * Legacy spellings accepted as INPUT for a pillar, mapped to the value we
 * store. Never used for storage or display.
 *
 * D32 renamed the sixth pillar from `CEE` to `Core Excellence Execution`. The
 * abbreviation cannot simply disappear, because it is already baked into things
 * we do not control:
 *   - every upload template in circulation (including the current v1.3) offers
 *     "CEE" in its Pillar dropdown;
 *   - partner integrations filter `/api/v1/initiatives?pillar=CEE`, and MCP
 *     clients pass it to `list_initiatives` / `create_initiative`;
 *   - dashboard and graph filter links with `?pillar=CEE` are already shared.
 * Accepting the old spelling on the way in costs nothing and keeps all three
 * working; the same reasoning kept `best_presenter` on the API under D25.
 */
export const LEGACY_PILLAR_SPELLINGS: Readonly<Record<string, Pillar>> = {
  CEE: "Core Excellence Execution",
};

/**
 * Every pillar spelling a request may send: the canonical values plus the
 * legacy ones. This is what the write schemas validate against (and therefore
 * what the published OpenAPI document lists), so the spec states plainly that
 * the old spelling is still accepted rather than silently tolerating it.
 */
export const PILLAR_INPUT_VALUES = [
  ...PILLARS,
  ...Object.keys(LEGACY_PILLAR_SPELLINGS),
] as [string, ...string[]];

const LEGACY_PILLAR_LOOKUP: Record<string, Pillar> = Object.fromEntries(
  Object.entries(LEGACY_PILLAR_SPELLINGS).map(([k, v]) => [k.toLowerCase(), v]),
);

/**
 * Resolve one pillar input to its stored value. Matching is trimmed and
 * case-insensitive, because this also serves free-text paths (spreadsheet
 * cells, query strings) where casing is not under anyone's control.
 *
 * A value that is not a known alias is returned UNCHANGED — so a genuinely
 * off-enum pillar still fails validation as itself, with its own spelling in
 * the error message, rather than being silently swallowed.
 */
export function canonicalPillar<T>(value: T): T | Pillar {
  if (typeof value !== "string") return value;
  return LEGACY_PILLAR_LOOKUP[value.trim().toLowerCase()] ?? value;
}

/** `canonicalPillar` over a list of filter values. Non-arrays pass through. */
export function canonicalPillars<T>(values: T): T | (string | Pillar)[] {
  if (!Array.isArray(values)) return values;
  return values.map((v) => canonicalPillar(v));
}

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
