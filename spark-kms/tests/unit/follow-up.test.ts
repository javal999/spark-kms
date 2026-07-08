import { describe, it, expect } from "vitest";
import { splitFollowUp } from "@/src/lib/follow-up";

/**
 * A follow-up that lists several things should become several action items —
 * split on new lines and on numbered/bulleted list markers (Levi's decision:
 * "Lines + list markers"). Single, plain follow-ups stay one item, and numbers
 * that are part of a sentence must NOT trigger a split.
 */
describe("splitFollowUp", () => {
  it("returns nothing for empty / blank input", () => {
    expect(splitFollowUp("")).toEqual([]);
    expect(splitFollowUp("   \n  ")).toEqual([]);
    expect(splitFollowUp(null)).toEqual([]);
    expect(splitFollowUp(undefined)).toEqual([]);
  });

  it("keeps a single plain follow-up as one item", () => {
    expect(splitFollowUp("Chase the mall vendor for a quote")).toEqual([
      "Chase the mall vendor for a quote",
    ]);
  });

  it("splits on new lines", () => {
    expect(splitFollowUp("Call vendor\nBook the venue\nSend recap")).toEqual([
      "Call vendor",
      "Book the venue",
      "Send recap",
    ]);
  });

  it("splits a numbered list across lines and strips the markers", () => {
    expect(splitFollowUp("1. Call vendor\n2. Book venue\n3. Send recap")).toEqual([
      "Call vendor",
      "Book venue",
      "Send recap",
    ]);
  });

  it("splits an inline numbered list written on one line", () => {
    expect(splitFollowUp("1. Call vendor 2. Book venue 3. Send recap")).toEqual([
      "Call vendor",
      "Book venue",
      "Send recap",
    ]);
    expect(splitFollowUp("1) prep deck 2) rehearse")).toEqual([
      "prep deck",
      "rehearse",
    ]);
  });

  it("splits bulleted lists (dash / bullet) and strips the markers", () => {
    expect(splitFollowUp("- alpha\n- beta")).toEqual(["alpha", "beta"]);
    expect(splitFollowUp("• alpha • beta")).toEqual(["alpha", "beta"]);
  });

  it("does NOT split a number that's part of a sentence", () => {
    expect(splitFollowUp("We need 2 quotes and 3 sign-offs")).toEqual([
      "We need 2 quotes and 3 sign-offs",
    ]);
    // a single leading marker is stripped but not falsely multiplied
    expect(splitFollowUp("Ship version 2. next week")).toEqual([
      "Ship version 2. next week",
    ]);
  });

  it("drops empty pieces and trims whitespace", () => {
    expect(splitFollowUp("  Call vendor  \n\n   \n  Book venue ")).toEqual([
      "Call vendor",
      "Book venue",
    ]);
  });

  it("strips a lone leading marker on a single item", () => {
    expect(splitFollowUp("1. just one thing")).toEqual(["just one thing"]);
  });
});
