import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  REGIONS,
  SEGMENTS,
  PILLARS,
  CATEGORIES,
  STAGES,
} from "@/src/lib/enums";
import { SCORING_RULES, STREAM_LABELS } from "@/src/services/scoring";
import {
  TEMPLATE_COLUMNS,
  DEFAULT_TEMPLATE_VERSION,
} from "@/src/services/template";
import { MAX_UPLOAD_ROWS, MAX_UPLOAD_BYTES } from "@/src/services/upload";
import { DEFAULT_DEDUP_THRESHOLD } from "@/src/services/duplicates";
import {
  GUIDE_COPY,
  LANGS,
  resolveLang,
  t,
  type GuideKey,
} from "@/src/content/guide-copy";
import { MCP_GUIDE_HTML } from "@/src/lib/mcp-guide-html";

/**
 * Drift guard for the /guide page ("How SPARK works").
 *
 * The page RENDERS its numbers from the modules below, so it can never display
 * a stale value. What it cannot do on its own is keep the prose around those
 * numbers honest — "creating an initiative earns one point in total, not two"
 * stops being true the moment the rulebook changes shape.
 *
 * So the values are pinned here as literals. Any change to scoring, the enums,
 * the upload template or the limits turns this suite red on purpose. Fixing it
 * is three steps, in this order:
 *   1. update KMS-Requirements-Doc-v1.1.md (rulebook table, §4.1, new D-number),
 *   2. re-read app/(app)/guide/page.tsx and correct the wording around it,
 *   3. update the literal below to match.
 */

const GUIDE_PAGE = path.join(process.cwd(), "app/(app)/guide/page.tsx");
const guideSource = readFileSync(GUIDE_PAGE, "utf8");

describe("guide page: scoring rulebook is unchanged", () => {
  it("point values and streams match the pinned rulebook", () => {
    expect(SCORING_RULES).toEqual({
      new_initiative: { stream: "presenter", points: 1 },
      entry: { stream: "presenter", points: 1 },
      bp_of_week: { stream: "best_practice", points: 2 },
    });
  });

  it("stream display labels are unchanged", () => {
    expect(STREAM_LABELS).toEqual({
      best_practice: "Best Practice",
      presenter: "Contribution",
    });
  });

  it("the guide explains every rule that can earn points", () => {
    for (const reason of Object.keys(SCORING_RULES)) {
      expect(
        guideSource.includes(`"${reason}"`),
        `guide page does not mention the "${reason}" scoring rule`,
      ).toBe(true);
    }
  });
});

describe("guide page: dropdown lists are unchanged", () => {
  it.each([
    ["region", REGIONS, ["Jakarta Greater", "Kalimantan", "Sumatera", "CJWJ", "EJBN", "Sulawesi"]],
    ["segment", SEGMENTS, ["Halal PC", "Teen & ES", "Masstige", "All"]],
    [
      "pillar",
      PILLARS,
      [
        "Social Buzz",
        "Personalized CRM",
        "Relevant Beauty Lifestyle",
        "Activated New Touchpoint",
        "Key Territory Execution",
        "Core Excellence Execution",
      ],
    ],
    ["category", CATEGORIES, ["Best Practice", "Unlocking"]],
    ["stage", STAGES, ["Idea", "Pilot", "Running", "Ready to Scale"]],
  ])("%s", (_name, live, pinned) => {
    expect([...live]).toEqual(pinned);
  });
});

describe("guide page: upload rules are unchanged", () => {
  it("template version and columns match the pinned list", () => {
    expect(DEFAULT_TEMPLATE_VERSION).toBe("v1.3");
    expect([...TEMPLATE_COLUMNS]).toEqual([
      "Tanggal",
      "Region",
      "Segment",
      "PIC",
      "Pillar",
      "Category",
      "Topic/Tema",
      "Description",
      "Progress",
      "Need Follow Up Action/Unlocking",
      "Stage",
      "Best Practices of The Week",
      "Link File",
    ]);
  });

  it("limits and the duplicate threshold are unchanged", () => {
    expect(MAX_UPLOAD_ROWS).toBe(500);
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
    expect(DEFAULT_DEDUP_THRESHOLD).toBe(0.4);
  });
});

describe("guide page: values are read from the code, not retyped", () => {
  it.each([
    "SCORING_RULES",
    "STREAM_LABELS",
    "REGIONS",
    "SEGMENTS",
    "PILLARS",
    "CATEGORIES",
    "STAGES",
    "TEMPLATE_COLUMNS",
    "DEFAULT_TEMPLATE_VERSION",
    "MAX_UPLOAD_ROWS",
    "MAX_UPLOAD_BYTES",
    "DEFAULT_DEDUP_THRESHOLD",
  ])("renders %s from its source module", (symbol) => {
    expect(guideSource).toContain(symbol);
  });

  it("is gated to admins", () => {
    expect(guideSource).toContain("isAdmin");
    expect(guideSource).toContain('redirect("/")');
  });
});

/**
 * D29: the prose moved to src/content/guide-copy.ts in English and Indonesian.
 * The page still owns the structure and still renders every value from the code
 * modules above — the checks in this file's earlier blocks cover that. What is
 * added here is the bilingual half: both languages exist for every key, and
 * neither language retypes a number the page is supposed to read from the code.
 */

describe("guide copy: both languages, no drift", () => {
  it("every key has non-empty English and Indonesian", () => {
    const entries = Object.entries(GUIDE_COPY);
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, value] of entries) {
      for (const lang of LANGS) {
        expect(typeof value[lang], `${key}.${lang} is missing`).toBe("string");
        expect(value[lang].trim().length, `${key}.${lang} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it("no key exists in one language only", () => {
    for (const [key, value] of Object.entries(GUIDE_COPY)) {
      expect(Object.keys(value).sort(), `${key} key parity`).toEqual([
        ...LANGS,
      ].sort());
    }
  });

  it("values the page reads from code are placeholders, in both languages", () => {
    const placeholders: Array<[GuideKey, string[]]> = [
      ["points.p1", ["{bp}", "{contrib}"]],
      ["upload.p1", ["{version}"]],
      ["upload.p4", ["{rows}", "{mb}"]],
      ["duplicates.p1", ["{pct}"]],
    ];
    for (const [key, needles] of placeholders) {
      for (const lang of LANGS) {
        for (const needle of needles) {
          expect(
            GUIDE_COPY[key][lang].includes(needle),
            `${key}.${lang} should carry ${needle}`,
          ).toBe(true);
        }
      }
    }
  });

  it("neither language retypes a live value as a literal", () => {
    const copySource = readFileSync(
      path.join(process.cwd(), "src/content/guide-copy.ts"),
      "utf8",
    );
    for (const literal of [
      DEFAULT_TEMPLATE_VERSION,
      String(MAX_UPLOAD_ROWS),
      String(Math.round(DEFAULT_DEDUP_THRESHOLD * 100)),
      String(STREAM_LABELS.presenter),
    ]) {
      expect(
        copySource.includes(literal),
        `guide copy hard-codes "${literal}" instead of interpolating it`,
      ).toBe(false);
    }
  });

  it("interpolation fills placeholders and leaves the rest alone", () => {
    expect(t("upload.p1", "en", { version: "v9.9" })).toContain("v9.9");
    expect(t("upload.p1", "id", { version: "v9.9" })).toContain("v9.9");
    expect(t("upload.p1", "en", { version: "v9.9" })).not.toContain("{version}");
  });

  it("an unknown ?lang= value falls back to English", () => {
    expect(resolveLang(undefined)).toBe("en");
    expect(resolveLang("fr")).toBe("en");
    expect(resolveLang("id")).toBe("id");
  });
});

describe("guide page: the language toggle is wired up", () => {
  it("reads the language from the query string and renders both options", () => {
    expect(guideSource).toContain("resolveLang");
    expect(guideSource).toContain("searchParams");
    expect(guideSource).toContain("LangToggle");
  });

  it("takes its prose from the copy module rather than inline strings", () => {
    expect(guideSource).toContain("@/src/content/guide-copy");
  });
});

/**
 * The partner-facing MCP guide lists what the API accepts. It was hand-written
 * and had drifted from the enums twice (missing Sulawesi, missing the sixth
 * pillar) before D32 made it render from the constants. Pin it so it cannot
 * drift again — this is the same guarantee D26 gave `/guide`.
 */
describe("MCP integration guide: allowed values match the enums", () => {
  it.each([
    ["region", REGIONS],
    ["segment", SEGMENTS],
    ["pillar", PILLARS],
    ["category", CATEGORIES],
    ["stage", STAGES],
  ])("%s", (_name, values) => {
    for (const v of values) {
      expect(MCP_GUIDE_HTML).toContain(`<code>${v.replace(/&/g, "&amp;")}</code>`);
    }
  });

  it("no longer advertises the retired CEE abbreviation", () => {
    expect(MCP_GUIDE_HTML).toContain("<code>Core Excellence Execution</code>");
    expect(MCP_GUIDE_HTML).not.toContain("<code>CEE</code>");
  });
});
