/**
 * Real Topic/Tema titles extracted from `SPARK WEEKLY UPDATE.numbers`
 * (Dashboard BP & Unlocking sheet, the 45 entries → 21 distinct topics).
 *
 * These are the genuine Indonesian/English + brand-name titles used to
 * CALIBRATE the pg_trgm duplicate threshold (task 1.6, REQ-D3). The full 45-row
 * SCORED golden fixture with regions/segments/BP flags is built separately in
 * task 2.3 (`spark-45.ts`) for the phase-2 golden test.
 *
 * Extracted losslessly from the file's shared-string table; not hand-authored.
 */
export const SPARK_REAL_TITLES: string[] = [
  "Pop up store make over",
  "Beauty & The Heat - Make Over x Laboré x Twerkshop Bali",
  "Activated New Touchpoint - MUA Coach",
  "Paket Umrah dan Haji",
  "Open trip kapal Phinisi",
  "Look Studio Hype Circuit - Turning Hype Place and Creative Workshop Into New Youth Conversion Touchpoint",
  "Kahf X Yamaha di PRJ",
  "Activate CRM LMT -Planet Swalayan",
  "Member IG Channel dan WA community",
  "Make Up Concert - Make Over",
  "In store and out store activation",
  "PCA Collab with Hello Market Solo",
  "Beauty & Grooming class",
  "Creative Workshop with Bidang Pendidikan PWP PT Badak NGL",
  "Paragon x Whoosh Collaboration Menuju 500 Tahun Jakarta",
  "Project ParaHub",
  "Tourism Yogyakarta 2025",
  "OMG BIntang Seminyak -Project Tourism",
  "Unlocking Potency Kotabaru - Tanah Bumbu",
  "WA Group dan WA channel",
  "Purchase Registration (Receipt-based CRM Database Capture)",
];

/**
 * Calibration probes: a query title paired with the real title it SHOULD match.
 * Each represents a real duplicate-entry scenario (re-typing an existing topic
 * with different spelling / punctuation / word order / casing). The threshold
 * is calibrated so the expected match ranks within the top 3.
 */
export const DUPLICATE_PROBES: { query: string; expectedMatch: string }[] = [
  // Exact re-entry.
  { query: "Pop up store make over", expectedMatch: "Pop up store make over" },
  // Spelling + hyphenation variant.
  { query: "Pop-up store makeover", expectedMatch: "Pop up store make over" },
  // Word-order rewording (Indonesian).
  {
    query: "WA channel dan WA group",
    expectedMatch: "WA Group dan WA channel",
  },
  // All-caps.
  { query: "PROJECT PARAHUB", expectedMatch: "Project ParaHub" },
  // Brand-name variant, dropped "di".
  { query: "Kahf x Yamaha PRJ", expectedMatch: "Kahf X Yamaha di PRJ" },
  // Reordered brand phrase.
  {
    query: "MUA Coach - Activated New Touchpoint",
    expectedMatch: "Activated New Touchpoint - MUA Coach",
  },
  // Partial but distinctive.
  {
    query: "Hello Market Solo PCA collaboration",
    expectedMatch: "PCA Collab with Hello Market Solo",
  },
];

/**
 * A title with no real duplicate in the corpus — must NOT surface any candidate
 * above threshold (guards against a threshold set so low everything matches).
 */
export const NON_DUPLICATE_QUERY =
  "Quarterly finance reconciliation spreadsheet automation";
