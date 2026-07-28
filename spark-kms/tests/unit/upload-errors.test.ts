import { describe, it, expect } from "vitest";
import {
  failureMessage,
  networkMessage,
  validateUploadFile,
  errorReportCsv,
  type ErrorReportRow,
} from "@/src/lib/upload-errors";

/**
 * Every upload failure must give the user a specific, actionable message — the
 * whole point of this change (no bare "Network error"). Each case asserts the
 * user is told what happened and, where relevant, what to do next.
 */

const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("failureMessage", () => {
  it("passes the server's own error text straight through", async () => {
    const m = await failureMessage(
      jsonRes(409, { error: "This file has already been committed." }),
      "import",
    );
    expect(m.title).toBe("This file has already been committed.");
  });

  it("maps 413 to a size-specific, actionable hint", async () => {
    const m = await failureMessage(new Response("", { status: 413 }), "read");
    expect(m.title).toMatch(/too large/i);
    expect(m.description).toMatch(/10 MB/);
  });

  it("maps auth failures to a re-login hint", async () => {
    for (const status of [401, 403]) {
      const m = await failureMessage(new Response("", { status }), "read");
      expect(m.title).toMatch(/session/i);
      expect(m.description).toMatch(/sign in again/i);
    }
  });

  it("maps gateway/timeout statuses to a retry hint that reassures nothing was saved", async () => {
    for (const status of [408, 502, 503, 504]) {
      const m = await failureMessage(new Response("", { status }), "import");
      expect(m.title).toMatch(/too long/i);
      expect(m.description).toMatch(/nothing was saved/i);
    }
  });

  it("falls back gracefully when the body is a non-JSON error page", async () => {
    // e.g. a proxy 504 that returns HTML — must NOT throw or say "Network error"
    const m = await failureMessage(
      new Response("<html>Gateway Timeout</html>", { status: 504 }),
      "read",
    );
    expect(m.title).toMatch(/too long/i);
  });

  it("500 uses the verb and points to the SPARK team", async () => {
    const m = await failureMessage(new Response("", { status: 500 }), "import");
    expect(m.title).toContain("import");
    expect(m.description).toMatch(/SPARK team/i);
  });

  it("unknown status still gives an actionable message with the code", async () => {
    const m = await failureMessage(new Response("", { status: 418 }), "read");
    expect(m.title).toContain("418");
    expect(m.description).toBeTruthy();
  });

  it("surfaces a server traceId in the 500 message so users can quote it", async () => {
    // 500 with no server `error` text but a captured traceId (the exact case
    // the observability change produces: generic body + { traceId }).
    const m = await failureMessage(
      jsonRes(500, { error: undefined, traceId: "err_abc123def456" }),
      "import",
    );
    expect(m.title).toContain("import");
    expect(m.description).toContain("err_abc123def456");
    expect(m.description).toMatch(/SPARK team/i);
  });

  it("omits the ref suffix when there is no traceId", async () => {
    const m = await failureMessage(new Response("", { status: 500 }), "import");
    expect(m.description).not.toMatch(/ref /);
  });
});

describe("networkMessage", () => {
  it("distinguishes offline from unreachable", () => {
    expect(networkMessage(false).title).toMatch(/offline/i);
    expect(networkMessage(true).title).toMatch(/reach the server/i);
    // both reassure nothing was saved
    expect(networkMessage(false).description).toMatch(/try again/i);
    expect(networkMessage(true).description).toMatch(/nothing was saved/i);
  });
});

describe("errorReportCsv", () => {
  const row = (
    rowNumber: number,
    title: string,
    errors: string[],
    extra: Partial<ErrorReportRow["summary"]> = {},
  ): ErrorReportRow => ({
    rowNumber,
    summary: { title, region: "Kalimantan", segment: "All", category: "", ...extra },
    errors,
  });

  it("emits a header plus one line per error row, with all messages joined", () => {
    const csv = errorReportCsv([
      row(3, "No Region", ["Region is required", "Category is required"], { region: "" }),
      row(5, "Bad Date", ["Tanggal: Date must be YYYY-MM-DD"]),
    ]);
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe('"Row","Topic/Tema","Region","Segment","Category","Errors"');
    expect(lines).toHaveLength(3); // header + 2 rows
    // both messages for row 3 are joined into the single Errors cell
    expect(lines[1]).toContain('"Region is required; Category is required"');
    expect(lines[1]).toContain('"3"');
    expect(lines[2]).toContain('"Bad Date"');
  });

  it("starts with a BOM so Excel reads UTF-8, and quotes/escapes fields", () => {
    const csv = errorReportCsv([
      row(7, 'Emina "Glow" Kit', ['weird, value with "quotes"']),
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    // internal double-quotes are doubled per RFC 4180
    expect(csv).toContain('"Emina ""Glow"" Kit"');
    expect(csv).toContain('"weird, value with ""quotes"""');
  });

  it("handles an empty list (header only)", () => {
    const csv = errorReportCsv([]).replace(/^﻿/, "");
    expect(csv).toBe('"Row","Topic/Tema","Region","Segment","Category","Errors"');
  });
});

describe("validateUploadFile", () => {
  it("accepts a normal .xlsx", () => {
    expect(validateUploadFile("SPARK-Upload.xlsx", 5000)).toBeNull();
  });

  it("rejects a non-xlsx file with template guidance", () => {
    const m = validateUploadFile("data.csv", 5000);
    expect(m?.title).toMatch(/\.xlsx/i);
    expect(m?.description).toMatch(/template/i);
  });

  it("rejects an empty file", () => {
    expect(validateUploadFile("empty.xlsx", 0)?.title).toMatch(/empty/i);
  });

  it("rejects an oversized file and reports its size", () => {
    const m = validateUploadFile("big.xlsx", 15 * 1024 * 1024);
    expect(m?.title).toMatch(/too large/i);
    expect(m?.description).toMatch(/15\.0 MB/);
  });

  it("is case-insensitive about the extension", () => {
    expect(validateUploadFile("REPORT.XLSX", 1000)).toBeNull();
  });
});
