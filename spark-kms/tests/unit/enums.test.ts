import { describe, it, expect } from "vitest";
import {
  regionEnum,
  segmentEnum,
  pillarEnum,
  entryCategoryEnum,
  stageEnum,
  actionStatusEnum,
} from "@/src/db/schema";
import {
  REGIONS,
  SEGMENTS,
  PILLARS,
  CATEGORIES,
  STAGES,
  ACTION_STATUSES,
} from "@/src/lib/enums";

/** Guards the client-safe enum copies against the DB source of truth. */
describe("client enum lists match DB schema enums", () => {
  it.each([
    ["region", REGIONS, regionEnum.enumValues],
    ["segment", SEGMENTS, segmentEnum.enumValues],
    ["pillar", PILLARS, pillarEnum.enumValues],
    ["category", CATEGORIES, entryCategoryEnum.enumValues],
    ["stage", STAGES, stageEnum.enumValues],
    ["action_status", ACTION_STATUSES, actionStatusEnum.enumValues],
  ])("%s", (_name, client, db) => {
    expect([...client]).toEqual([...db]);
  });
});
