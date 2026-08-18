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
        "CEE",
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
