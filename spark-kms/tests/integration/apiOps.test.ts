import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  opCreateInitiative,
  opAddEntry,
  opListInitiatives,
  ApiScopeError,
  ApiDuplicateError,
  ApiValidationError,
  type ApiContext,
} from "@/src/services/apiOps";
import { createInitiative } from "@/src/services/initiatives";
import type { NewInitiativeInput } from "@/src/validation/entry";
import { initiativeStreamTotals } from "@/src/services/scores";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import { db } from "@/src/db";
import { initiatives } from "@/src/db/schema";

/**
 * Gate 5 — integration API operations layer. This is the code path shared by
 * both /api/v1 and the MCP tools, so proving it here proves both surfaces.
 */

const payload = {
  title: "Regional pop-up activation",
  region: "Sumatera",
  segment: "Masstige",
  pillar: "Activated New Touchpoint",
  pic: "Sri",
  entryDate: "2026-07-01",
  category: "Best Practice",
  detail: "Launched the pop-up, strong footfall",
};

let owner: number;
const writeCtx = (): ApiContext => ({ scope: "write", ownerUserId: owner });
const readCtx = (): ApiContext => ({ scope: "read", ownerUserId: owner });

describe("apiOps (Gate 5)", () => {
  beforeEach(async () => {
    await resetAndSeed();
    owner = await getSuperAdminId();
  });

  it("read scope cannot write (403 → ApiScopeError)", async () => {
    await expect(
      opCreateInitiative(readCtx(), { ...payload, force_new: true }),
    ).rejects.toBeInstanceOf(ApiScopeError);
    await expect(
      opAddEntry(readCtx(), 1, {
        entryDate: "2026-07-02",
        category: "Unlocking",
        detail: "x",
      }),
    ).rejects.toBeInstanceOf(ApiScopeError);
  });

  it("read scope can read", async () => {
    const res = await opListInitiatives(readCtx(), {});
    expect(res.total).toBe(0);
  });

  it("write create scores +2 and attributes created_by to the key owner", async () => {
    const res = await opCreateInitiative(writeCtx(), {
      ...payload,
      force_new: true,
    });
    expect(res.mode).toBe("created");
    const totals = await initiativeStreamTotals(res.initiativeId);
    expect(totals.best_practice).toBe(2);
    expect(totals.total).toBe(2);

    const [ini] = await db
      .select({ createdBy: initiatives.createdBy })
      .from(initiatives)
      .where(eq(initiatives.id, res.initiativeId));
    expect(ini.createdBy).toBe(owner);
  });

  it("a ticked BP-of-week via API auto-awards +2 immediately (v1.2, D14)", async () => {
    const res = await opCreateInitiative(writeCtx(), {
      ...payload,
      bpOfWeekNominated: true,
      force_new: true,
    });
    const totals = await initiativeStreamTotals(res.initiativeId);
    expect(totals.best_practice).toBe(4); // +1 new +1 entry +2 bp_of_week
    expect(totals.total).toBe(4);
  });

  it("honors the 409 duplicate contract incl. force_new and append_to", async () => {
    const first = await opCreateInitiative(writeCtx(), {
      ...payload,
      force_new: true,
    });

    // Same title, no controls → duplicate error carrying candidates.
    const err = await opCreateInitiative(writeCtx(), payload).catch((e) => e);
    expect(err).toBeInstanceOf(ApiDuplicateError);
    expect((err as ApiDuplicateError).candidates.length).toBeGreaterThanOrEqual(1);
    expect((err as ApiDuplicateError).candidates[0].id).toBe(first.initiativeId);

    // force_new → creates a distinct initiative anyway.
    const forced = await opCreateInitiative(writeCtx(), {
      ...payload,
      force_new: true,
    });
    expect(forced.mode).toBe("created");
    expect(forced.initiativeId).not.toBe(first.initiativeId);

    // append_to → appends an entry to the existing one (+1, different day).
    const appended = await opCreateInitiative(writeCtx(), {
      append_to: first.initiativeId,
      entryDate: "2026-07-03",
      category: "Unlocking",
      detail: "follow-up progress",
    });
    expect(appended.mode).toBe("appended");
    expect(appended.initiativeId).toBe(first.initiativeId);
    const totals = await initiativeStreamTotals(first.initiativeId);
    expect(totals.total).toBe(3); // 2 from create + 1 appended entry
  });

  it("produces points identical to the web-form service (parity)", async () => {
    const viaApi = await opCreateInitiative(writeCtx(), {
      ...payload,
      title: "Parity via API",
      force_new: true,
    });
    const viaForm = await createInitiative(
      {
        ...payload,
        title: "Parity via form",
        stage: "Idea",
        bpOfWeekNominated: false,
      } as NewInitiativeInput,
      owner,
    );
    const a = await initiativeStreamTotals(viaApi.initiativeId);
    const f = await initiativeStreamTotals(viaForm.initiativeId);
    expect(a).toEqual(f);
    expect(a.total).toBe(2);
  });

  it("rejects invalid write bodies with ApiValidationError (400)", async () => {
    await expect(
      opCreateInitiative(writeCtx(), { ...payload, title: "", force_new: true }),
    ).rejects.toBeInstanceOf(ApiValidationError);
  });
});
