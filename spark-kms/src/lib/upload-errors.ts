/**
 * User-facing message mapping for the bulk-upload flow. Pure (no React/toast)
 * so the messaging can be unit-tested. The goal: every failure tells the user
 * what happened AND what to do next — never a bare "Network error".
 */

export const MAX_UPLOAD_MB = 10;

export type UploadMessage = { title: string; description?: string };

/**
 * Turn a failed HTTP response into a specific, actionable message. Prefers the
 * server's own error text (the upload API returns clear messages); falls back
 * to a per-status hint when the body isn't JSON — which is exactly what happens
 * on a proxy/gateway timeout or an oversized-request error page.
 */
export async function failureMessage(
  res: Response,
  verb: string,
): Promise<UploadMessage> {
  let serverMsg: string | undefined;
  let traceId: string | undefined;
  try {
    const body = await res.json();
    serverMsg = body?.error;
    traceId = typeof body?.traceId === "string" ? body.traceId : undefined;
  } catch {
    // Body wasn't JSON — fall through to a status-based message.
  }
  // A traceId means the server captured this failure — show it so the user can
  // quote it to the SPARK team, who can look up the exact error by that ref.
  const ref = traceId ? ` (ref ${traceId})` : "";
  if (serverMsg) return { title: serverMsg };

  switch (res.status) {
    case 413:
      return {
        title: "File is too large",
        description: `Keep it under ${MAX_UPLOAD_MB} MB, or split it into smaller files.`,
      };
    case 401:
    case 403:
      return {
        title: "Your session expired",
        description: "Refresh the page, sign in again, then retry the upload.",
      };
    case 408:
    case 502:
    case 503:
    case 504:
      return {
        title: "The server took too long to respond",
        description:
          "The file may be large or the connection slow. Wait a moment and try again — nothing was saved.",
      };
    case 500:
      return {
        title: `Couldn't ${verb} the file`,
        description:
          `Something went wrong on the server. If it keeps happening, tell the SPARK team${ref}.`,
      };
    default:
      return {
        title: `Upload failed (error ${res.status})`,
        description: `Please try again in a moment.${ref ? ` If it persists, tell the SPARK team${ref}.` : ""}`,
      };
  }
}

/** Message for a fetch that never reached or returned from the server. */
export function networkMessage(
  online: boolean = typeof navigator === "undefined" ? true : navigator.onLine,
): UploadMessage {
  return online
    ? {
        title: "Couldn't reach the server",
        description: "Check your connection and retry. Nothing was saved.",
      }
    : {
        title: "You appear to be offline",
        description:
          "Check your internet connection and try again — nothing was saved.",
      };
}

/**
 * Build a readable CSV error report from the preview's error rows — one row per
 * bad line, every message for that line joined into the Errors column. Pure so
 * it can be unit-tested; the component only wraps the result in a download.
 * A leading BOM makes Excel read UTF-8 (Indonesian text) correctly; rows use
 * CRLF. Fields are quoted and internal quotes doubled per RFC 4180.
 */
export type ErrorReportRow = {
  rowNumber: number;
  summary: { title: string; region: string; segment: string; category: string };
  errors: string[];
};

export function errorReportCsv(rows: ErrorReportRow[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["Row", "Topic/Tema", "Region", "Segment", "Category", "Errors"];
  const body = rows.map((r) =>
    [
      r.rowNumber,
      r.summary.title,
      r.summary.region,
      r.summary.segment,
      r.summary.category,
      r.errors.join("; "),
    ]
      .map(esc)
      .join(","),
  );
  return "﻿" + [header.map(esc).join(","), ...body].join("\r\n");
}

/** Client-side pre-check before uploading; returns a message if the file is bad. */
export function validateUploadFile(
  name: string,
  size: number,
): UploadMessage | null {
  if (!name.toLowerCase().endsWith(".xlsx")) {
    return {
      title: "That isn't an .xlsx file",
      description:
        "Use “Download template”, fill it in, then upload the saved .xlsx.",
    };
  }
  if (size === 0) {
    return {
      title: "That file is empty",
      description: "Re-save it from Excel and try again.",
    };
  }
  if (size > MAX_UPLOAD_MB * 1024 * 1024) {
    return {
      title: "File is too large",
      description: `It's ${(size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_UPLOAD_MB} MB. Split it into smaller files.`,
    };
  }
  return null;
}
