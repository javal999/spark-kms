import { describe, it, expect } from "vitest";
import {
  entryInputSchema,
  initiativeInputSchema,
  newInitiativeSchema,
  isStaleEntryDate,
} from "@/src/validation/entry";

const validEntry = {
  entryDate: "2026-07-01",
  category: "Best Practice",
  detail: "Ran a pop-up store makeover, +30% footfall",
};

const validInitiative = {
  title: "Pop up store make over",
  region: "Jakarta Greater",
  segment: "Teen & ES",
  pillar: "Key Territory Execution",
  pic: "Rani",
};

describe("entryInputSchema", () => {
  it("accepts a valid entry and defaults bpOfWeekNominated=false", () => {
    const parsed = entryInputSchema.parse(validEntry);
    expect(parsed.category).toBe("Best Practice");
    expect(parsed.bpOfWeekNominated).toBe(false);
  });

  it("requires entry_date", () => {
    const { entryDate, ...rest } = validEntry;
    void entryDate;
    expect(entryInputSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an invalid calendar date", () => {
    expect(
      entryInputSchema.safeParse({ ...validEntry, entryDate: "2026-02-30" })
        .success,
    ).toBe(false);
  });

  it("rejects a non-ISO date shape", () => {
    expect(
      entryInputSchema.safeParse({ ...validEntry, entryDate: "01/07/2026" })
        .success,
    ).toBe(false);
  });

  it("rejects an off-enum category", () => {
    expect(
      entryInputSchema.safeParse({ ...validEntry, category: "Learning" })
        .success,
    ).toBe(false);
  });

  it("requires non-empty detail", () => {
    expect(
      entryInputSchema.safeParse({ ...validEntry, detail: "   " }).success,
    ).toBe(false);
  });

  it("trims whitespace on detail and follow_up", () => {
    const parsed = entryInputSchema.parse({
      ...validEntry,
      detail: "  did a thing  ",
      followUp: "  chase vendor  ",
    });
    expect(parsed.detail).toBe("did a thing");
    expect(parsed.followUp).toBe("chase vendor");
  });

  it("coerces a TRUE bp nomination", () => {
    const parsed = entryInputSchema.parse({
      ...validEntry,
      bpOfWeekNominated: true,
    });
    expect(parsed.bpOfWeekNominated).toBe(true);
  });
});

describe("initiativeInputSchema", () => {
  it("accepts a valid initiative and defaults stage=Idea", () => {
    const parsed = initiativeInputSchema.parse(validInitiative);
    expect(parsed.stage).toBe("Idea");
    expect(parsed.title).toBe("Pop up store make over");
  });

  it("requires title, region, segment, pillar, pic", () => {
    for (const key of ["title", "region", "segment", "pillar", "pic"]) {
      const clone: Record<string, unknown> = { ...validInitiative };
      delete clone[key];
      expect(initiativeInputSchema.safeParse(clone).success).toBe(false);
    }
  });

  it("rejects an off-enum region (e.g. Papua)", () => {
    expect(
      initiativeInputSchema.safeParse({
        ...validInitiative,
        region: "Papua",
      }).success,
    ).toBe(false);
  });

  it("accepts the CEE pillar under its full name (D32)", () => {
    expect(
      initiativeInputSchema.safeParse({
        ...validInitiative,
        pillar: "Core Excellence Execution",
      }).success,
    ).toBe(true);
  });

  it("accepts the legacy CEE spelling and normalizes it to the stored name (D32)", () => {
    // The abbreviation stays valid INPUT — templates, partner API calls and
    // shared filter links all still use it — but it must never survive as a
    // stored value, or the rename would have achieved nothing.
    const parsed = initiativeInputSchema.safeParse({
      ...validInitiative,
      pillar: "CEE",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.pillar).toBe("Core Excellence Execution");
  });

  it("rejects an off-enum pillar", () => {
    expect(
      initiativeInputSchema.safeParse({
        ...validInitiative,
        pillar: "Radical Synergy",
      }).success,
    ).toBe(false);
  });

  it("accepts an explicit valid stage", () => {
    const parsed = initiativeInputSchema.parse({
      ...validInitiative,
      stage: "Pilot",
    });
    expect(parsed.stage).toBe("Pilot");
  });
});

describe("newInitiativeSchema (create + first entry, shared by form and Excel)", () => {
  it("accepts a combined initiative + entry payload", () => {
    const parsed = newInitiativeSchema.parse({
      ...validInitiative,
      ...validEntry,
    });
    expect(parsed.title).toBe("Pop up store make over");
    expect(parsed.category).toBe("Best Practice");
    expect(parsed.stage).toBe("Idea");
  });

  it("fails if the entry half is invalid", () => {
    expect(
      newInitiativeSchema.safeParse({
        ...validInitiative,
        ...validEntry,
        category: "nope",
      }).success,
    ).toBe(false);
  });
});

describe("isStaleEntryDate (soft warning, > 30 days)", () => {
  const now = new Date("2026-07-06T03:00:00Z"); // Jakarta 2026-07-06 10:00
  it("flags an entry_date older than 30 days", () => {
    expect(isStaleEntryDate("2026-05-01", now)).toBe(true);
  });
  it("does not flag a recent entry_date", () => {
    expect(isStaleEntryDate("2026-07-01", now)).toBe(false);
  });
  it("does not flag a future entry_date", () => {
    expect(isStaleEntryDate("2026-07-10", now)).toBe(false);
  });
});
