/**
 * GOLDEN FIXTURE — the 45 real entries from `SPARK WEEKLY UPDATE.numbers`
 * (sheet "Dashboard BP & Unlocking", 2026-06-24 → 2026-07-02).
 *
 * Extracted losslessly with numbers-parser (not hand-authored). Off-enum values
 * corrected per requirements D5/D7 and MARKED in each row’s `corrections`:
 *   - region "Sulawesi"           → "Kalimantan"  (file’s own recap groups "Kalimantan + Sulawesi")
 *   - segment "ALL" / blank        → "All"
 *   - segment "Teens & ES"         → "Teen & ES"
 *   - pillar "Core Excellence Execution" → "Key Territory Execution"
 *
 * IMMUTABLE: if a scoring change breaks the golden test, the change is wrong
 * (or the requirements changed — ask Levi). See tests/testing policy.
 *
 * `bpConfirmed` = the file’s "Best Practices of The Week" column = TRUE (14 rows).
 */
export type GoldenEntry = {
  date: string;
  region: string;
  segment: string;
  pillar: string;
  category: "Best Practice" | "Unlocking";
  title: string;
  bpConfirmed: boolean;
  corrections?: string[];
};

export const SPARK_45: GoldenEntry[] = [
  { date: "2026-06-24", region: "Sumatera", segment: "Masstige", pillar: "Activated New Touchpoint", category: "Best Practice", title: "Pop up store make over", bpConfirmed: false },
  { date: "2026-06-24", region: "EJBN", segment: "Masstige", pillar: "Activated New Touchpoint", category: "Best Practice", title: "Beauty & The Heat - Make Over x Laboré x Twerkshop Bali", bpConfirmed: false },
  { date: "2026-06-24", region: "CJWJ", segment: "Halal PC", pillar: "Activated New Touchpoint", category: "Best Practice", title: "1. Kahf x KAI Skybridge (KAI DAOP 5) 2. Kahf x Club of 1986 3. Wardah x Kahf di Jogja Mandiri Marathon 4. Wardah x Sembada Gold", bpConfirmed: false },
  { date: "2026-06-24", region: "Kalimantan", segment: "All", pillar: "Activated New Touchpoint", category: "Best Practice", title: "Activated New Touchpoint - MUA Coach", bpConfirmed: false, corrections: ["region \"Sulawesi\" → \"Kalimantan\" (file recap groups \"Kalimantan + Sulawesi\")", "segment \"ALL\" → \"All\""] },
  { date: "2026-06-24", region: "Kalimantan", segment: "All", pillar: "Activated New Touchpoint", category: "Unlocking", title: "Paket Umrah dan Haji", bpConfirmed: false, corrections: ["segment \"ALL\" → \"All\""] },
  { date: "2026-06-24", region: "Kalimantan", segment: "All", pillar: "Activated New Touchpoint", category: "Unlocking", title: "Open trip kapal Phinisi", bpConfirmed: false, corrections: ["region \"Sulawesi\" → \"Kalimantan\" (file recap groups \"Kalimantan + Sulawesi\")", "segment \"ALL\" → \"All\""] },
  { date: "2026-06-24", region: "CJWJ", segment: "Teen & ES", pillar: "Activated New Touchpoint", category: "Unlocking", title: "Look Studio Hype Circuit - Turning Hype Place and Creative Workshop Into New Youth Conversion Touchpoint", bpConfirmed: true, corrections: ["segment \"Teens & ES\" → \"Teen & ES\""] },
  { date: "2026-06-24", region: "Jakarta Greater", segment: "Halal PC", pillar: "Activated New Touchpoint", category: "Unlocking", title: "Kahf X Yamaha di PRJ", bpConfirmed: false },
  { date: "2026-06-24", region: "Sumatera", segment: "Halal PC", pillar: "Personalized CRM", category: "Unlocking", title: "Activate CRM LMT -Planet Swalayan", bpConfirmed: false },
  { date: "2026-06-24", region: "Kalimantan", segment: "All", pillar: "Personalized CRM", category: "Best Practice", title: "Member IG Channel dan WA community", bpConfirmed: true, corrections: ["segment \"ALL\" → \"All\""] },
  { date: "2026-06-24", region: "Jakarta Greater", segment: "Masstige", pillar: "Relevant Beauty Lifestyle", category: "Best Practice", title: "Make Up Concert - Make Over", bpConfirmed: true },
  { date: "2026-06-24", region: "CJWJ", segment: "Masstige", pillar: "Relevant Beauty Lifestyle", category: "Best Practice", title: "In store and out store activation", bpConfirmed: false },
  { date: "2026-06-24", region: "CJWJ", segment: "Halal PC", pillar: "Relevant Beauty Lifestyle", category: "Best Practice", title: "PCA Collab with Hello Market Solo", bpConfirmed: false },
  { date: "2026-06-24", region: "Jakarta Greater", segment: "Teen & ES", pillar: "Relevant Beauty Lifestyle", category: "Best Practice", title: "Beauty & Grooming class", bpConfirmed: false, corrections: ["segment \"Teens & ES\" → \"Teen & ES\""] },
  { date: "2026-06-24", region: "Kalimantan", segment: "All", pillar: "Relevant Beauty Lifestyle", category: "Best Practice", title: "Creative Workshop with Bidang Pendidikan PWP PT Badak NGL", bpConfirmed: false, corrections: ["segment \"ALL\" → \"All\""] },
  { date: "2026-06-24", region: "Sumatera", segment: "Halal PC", pillar: "Relevant Beauty Lifestyle", category: "Best Practice", title: "1. Takeover Hype Café MTCH x Wardah 2. MDS Fair - Sister Day Beauty Class (Make Over) 3. Emina Beauty Class - PNM Mekar x CS Lifestyle MCP", bpConfirmed: false },
  { date: "2026-06-24", region: "Jakarta Greater", segment: "Masstige", pillar: "Key Territory Execution", category: "Best Practice", title: "Paragon x Whoosh Collaboration Menuju 500 Tahun Jakarta", bpConfirmed: true },
  { date: "2026-06-24", region: "Sumatera", segment: "Halal PC", pillar: "Key Territory Execution", category: "Best Practice", title: "Project ParaHub", bpConfirmed: false },
  { date: "2026-06-24", region: "CJWJ", segment: "Masstige", pillar: "Key Territory Execution", category: "Unlocking", title: "Tourism Yogyakarta 2025", bpConfirmed: false },
  { date: "2026-06-24", region: "EJBN", segment: "Teen & ES", pillar: "Key Territory Execution", category: "Unlocking", title: "OMG BIntang Seminyak -Project Tourism", bpConfirmed: false, corrections: ["segment \"Teens & ES\" → \"Teen & ES\""] },
  { date: "2026-06-24", region: "Kalimantan", segment: "All", pillar: "Key Territory Execution", category: "Unlocking", title: "Unlocking Potency Kotabaru - Tanah Bumbu", bpConfirmed: true, corrections: ["segment \"ALL\" → \"All\""] },
  { date: "2026-07-01", region: "CJWJ", segment: "Halal PC", pillar: "Personalized CRM", category: "Best Practice", title: "WA Group dan WA channel", bpConfirmed: false },
  { date: "2026-07-01", region: "Kalimantan", segment: "All", pillar: "Personalized CRM", category: "Best Practice", title: "Purchase Registration (Receipt-based CRM Database Capture)", bpConfirmed: false, corrections: ["segment \"ALL\" → \"All\""] },
  { date: "2026-07-01", region: "Sumatera", segment: "Halal PC", pillar: "Personalized CRM", category: "Unlocking", title: "Mekanisme Voucher CRM (Promo Month of Moist & Serum)", bpConfirmed: false },
  { date: "2026-07-01", region: "EJBN", segment: "Masstige", pillar: "Personalized CRM", category: "Best Practice", title: "1. Leora (CS) - CRM Glow More, Pay Less 2. LUWES LMT - CRM Cross Category Fashion", bpConfirmed: true },
  { date: "2026-07-01", region: "Jakarta Greater", segment: "Masstige", pillar: "Activated New Touchpoint", category: "Best Practice", title: "Labore x Alpro", bpConfirmed: true },
  { date: "2026-07-01", region: "Sumatera", segment: "Halal PC", pillar: "Activated New Touchpoint", category: "Unlocking", title: "Toko Saudi - Potential New Touchpoint", bpConfirmed: false },
  { date: "2026-07-01", region: "EJBN", segment: "Teen & ES", pillar: "Activated New Touchpoint", category: "Best Practice", title: "Emina Look Studio x PT Pegadaian", bpConfirmed: false, corrections: ["segment \"Teens & ES\" → \"Teen & ES\""] },
  { date: "2026-07-01", region: "Kalimantan", segment: "All", pillar: "Activated New Touchpoint", category: "Best Practice", title: "Paket Umrah dan Haji", bpConfirmed: true, corrections: ["segment \"ALL\" → \"All\""] },
  { date: "2026-07-01", region: "CJWJ", segment: "Halal PC", pillar: "Activated New Touchpoint", category: "Best Practice", title: "Wardah – Flow to the Sky (Wardah Pilates x Yogyakarta International Airport", bpConfirmed: false },
  { date: "2026-07-01", region: "CJWJ", segment: "Teen & ES", pillar: "Activated New Touchpoint", category: "Best Practice", title: "OMG x Koperasi (Pouyen & GSI)", bpConfirmed: false, corrections: ["segment \"Teens & ES\" → \"Teen & ES\""] },
  { date: "2026-07-01", region: "Jakarta Greater", segment: "Teen & ES", pillar: "Activated New Touchpoint", category: "Best Practice", title: "Emina Co-Lab Goes to School", bpConfirmed: false, corrections: ["segment \"Teens & ES\" → \"Teen & ES\""] },
  { date: "2026-07-01", region: "Jakarta Greater", segment: "Halal PC", pillar: "Activated New Touchpoint", category: "Best Practice", title: "Kahf X Yamaha di PRJ (update)", bpConfirmed: false },
  { date: "2026-07-01", region: "EJBN", segment: "Halal PC", pillar: "Relevant Beauty Lifestyle", category: "Best Practice", title: "Bravo Bojonegoro – House of W", bpConfirmed: false },
  { date: "2026-07-01", region: "CJWJ", segment: "Halal PC", pillar: "Relevant Beauty Lifestyle", category: "Best Practice", title: "1. Project Salatiga Glow in Color 2. Color Expert Class", bpConfirmed: false },
  { date: "2026-07-01", region: "Jakarta Greater", segment: "Halal PC", pillar: "Relevant Beauty Lifestyle", category: "Best Practice", title: "Content to Connection – Beauty Class Wardah", bpConfirmed: true },
  { date: "2026-07-01", region: "Sumatera", segment: "Masstige", pillar: "Relevant Beauty Lifestyle", category: "Best Practice", title: "Glasting Glow Mastershade Class", bpConfirmed: false },
  { date: "2026-07-01", region: "Kalimantan", segment: "All", pillar: "Relevant Beauty Lifestyle", category: "Best Practice", title: "Wardah Lips Party x Livi Cosmetic", bpConfirmed: true, corrections: ["segment \"ALL\" → \"All\""] },
  { date: "2026-07-01", region: "Sumatera", segment: "Teen & ES", pillar: "Key Territory Execution", category: "Unlocking", title: "Moni Cosmetics Group Batam", bpConfirmed: true, corrections: ["segment \"Teens & ES\" → \"Teen & ES\""] },
  { date: "2026-07-01", region: "EJBN", segment: "Masstige", pillar: "Key Territory Execution", category: "Unlocking", title: "Celebrating Beauty - Winning The Galungan Moment", bpConfirmed: true },
  { date: "2026-07-01", region: "CJWJ", segment: "Halal PC", pillar: "Key Territory Execution", category: "Unlocking", title: "Unlocking Area Potency Pangandaran", bpConfirmed: true },
  { date: "2026-07-01", region: "CJWJ", segment: "Teen & ES", pillar: "Key Territory Execution", category: "Best Practice", title: "Emina Matcha Mouth & Travel Buddy Bandung", bpConfirmed: true, corrections: ["segment \"Teens & ES\" → \"Teen & ES\""] },
  { date: "2026-07-02", region: "CJWJ", segment: "All", pillar: "Key Territory Execution", category: "Best Practice", title: "Bogor Reporting Store Leader", bpConfirmed: false, corrections: ["segment \"\" (blank) → \"All\"", "pillar \"Core Excellence Execution\" → \"Key Territory Execution\""] },
  { date: "2026-07-02", region: "EJBN", segment: "All", pillar: "Key Territory Execution", category: "Best Practice", title: "Jember Accelerate SL Productivity", bpConfirmed: false, corrections: ["segment \"\" (blank) → \"All\"", "pillar \"Core Excellence Execution\" → \"Key Territory Execution\""] },
  { date: "2026-07-02", region: "CJWJ", segment: "All", pillar: "Key Territory Execution", category: "Best Practice", title: "Glow and Share: Threads", bpConfirmed: false, corrections: ["segment \"\" (blank) → \"All\"", "pillar \"Core Excellence Execution\" → \"Key Territory Execution\""] },
];

/**
 * Hand-verified expected Best-Practice-of-week points, taken from the file’s
 * "Dashboard Final" recap (NOT computed from SPARK_45 — keeps the golden test
 * honest). Each = 2 × confirmed flags. Region rollups match the recap exactly.
 */
export const EXPECTED_BP_BY_REGION: Record<string, number> = {
  "EJBN": 4,
  "CJWJ": 6,
  "Jakarta Greater": 8,
  "Sumatera": 2,
  "Kalimantan": 8,
};

/** App-native granularity: per (region, segment) area. */
export const EXPECTED_BP_BY_AREA: Record<string, number> = {
  "Jakarta Greater / Masstige": 6,
  "Jakarta Greater / Halal PC": 2,
  "CJWJ / Teen & ES": 4,
  "CJWJ / Halal PC": 2,
  "EJBN / Masstige": 4,
  "Sumatera / Teen & ES": 2,
  "Kalimantan / All": 8,
};

export const EXPECTED_BP_TOTAL = 28;
export const EXPECTED_CONFIRMED_FLAGS = 14;
