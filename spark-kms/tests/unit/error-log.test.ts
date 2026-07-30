import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * captureError is the load-bearing piece of upload tracing: it must ALWAYS
 * return a trace id, ALWAYS write a structured stdout line, persist to the DB
 * when it can, and NEVER throw (logging must not mask the original failure).
 * The DB is the only boundary we mock.
 */

// Mock the db boundary. `insertValues` lets each test assert / control it.
const insertValues = vi.fn().mockResolvedValue(undefined);
vi.mock("@/src/db", () => ({
  db: { insert: () => ({ values: insertValues }) },
}));

import {
  captureError,
  serverErrorResponse,
  logSlowRequest,
  SLOW_REQUEST_MS,
} from "@/src/lib/error-log";

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  insertValues.mockClear().mockResolvedValue(undefined);
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errSpy.mockRestore();
});

describe("captureError", () => {
  it("returns a greppable err_ trace id", async () => {
    const id = await captureError(new Error("boom"), { route: "POST /x" });
    expect(id).toMatch(/^err_[a-f0-9]{12}$/);
  });

  it("writes a structured stdout line carrying the trace id and route", async () => {
    const id = await captureError(new Error("db exploded"), {
      route: "POST /api/upload/commit",
      actorId: 7,
      meta: { fileBytes: 2048 },
    });
    expect(errSpy).toHaveBeenCalled();
    const logged = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(logged.traceId).toBe(id);
    expect(logged.route).toBe("POST /api/upload/commit");
    expect(logged.actorId).toBe(7);
    expect(logged.message).toBe("db exploded");
    expect(logged.meta).toEqual({ fileBytes: 2048 });
  });

  it("persists the same trace id + error shape to the DB", async () => {
    const id = await captureError(new TypeError("bad col"), {
      route: "POST /api/upload/commit",
      actorId: 3,
    });
    expect(insertValues).toHaveBeenCalledTimes(1);
    const row = insertValues.mock.calls[0][0];
    expect(row.traceId).toBe(id);
    expect(row.name).toBe("TypeError");
    expect(row.message).toBe("bad col");
    expect(row.actorId).toBe(3);
  });

  it("still returns a trace id (and does NOT throw) when the DB write fails", async () => {
    insertValues.mockRejectedValueOnce(new Error("db down"));
    const id = await captureError(new Error("original failure"), {
      route: "POST /api/upload/commit",
    });
    expect(id).toMatch(/^err_/);
    // both the original capture and the persist-failure note were logged
    expect(errSpy).toHaveBeenCalledTimes(2);
  });

  it("handles a non-Error throwable without crashing", async () => {
    const id = await captureError("string thrown", { route: "GET /y" });
    expect(id).toMatch(/^err_/);
    const row = insertValues.mock.calls[0][0];
    expect(row.name).toBe("UnknownError");
    expect(row.message).toBe("string thrown");
  });
});

describe("logSlowRequest", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  it("logs a structured warn line when the request exceeds the threshold", () => {
    logSlowRequest("POST /api/upload/commit", Date.now() - (SLOW_REQUEST_MS + 1000), {
      fileBytes: 2048,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(line.kind).toBe("slow-request");
    expect(line.route).toBe("POST /api/upload/commit");
    expect(line.ms).toBeGreaterThanOrEqual(SLOW_REQUEST_MS);
    expect(line.meta).toEqual({ fileBytes: 2048 });
  });

  it("stays silent for a fast request", () => {
    logSlowRequest("POST /api/upload/preview", Date.now());
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("serverErrorResponse", () => {
  it("is a 500 carrying the trace id for the client to show", async () => {
    const res = serverErrorResponse("err_deadbeef0000");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.traceId).toBe("err_deadbeef0000");
    expect(body.error).toMatch(/something went wrong/i);
  });
});
