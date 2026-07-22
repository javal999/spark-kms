"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { flags } from "@/src/lib/flags";

/**
 * Usage emitter (Phase 7, task T3). Dark unless the tracking flag is on. Emits:
 *   - page_view on every route change (grouped route pattern, e.g.
 *     /initiatives/[id] — never the concrete id)
 *   - click on any element carrying [data-track] (opt-in only), with the
 *     element's label and normalized 0–1 click coordinates
 * Events buffer in memory and flush via sendBeacon on an interval, on tab hide,
 * and on pagehide. No PII is collected; identity is added server-side.
 */

type Ev = {
  eventType: "page_view" | "click";
  routePattern: string;
  path?: string;
  elementId?: string;
  elementText?: string;
  viewportW?: number;
  viewportH?: number;
  clickXNorm?: number;
  clickYNorm?: number;
  referrerPath?: string;
};

/** Group a concrete path into a route pattern: numeric segments → [id]. */
function toPattern(path: string): string {
  const segs = path.split("/").filter(Boolean).map((s) => (/^\d+$/.test(s) ? "[id]" : s));
  return "/" + segs.join("/");
}

export function UsageTracker() {
  const pathname = usePathname();
  const buffer = useRef<Ev[]>([]);
  const lastPath = useRef<string | null>(null);

  // Flush helpers live in refs so listeners/intervals share one buffer.
  const flush = useRef(() => {
    if (buffer.current.length === 0) return;
    const events = buffer.current;
    buffer.current = [];
    const body = JSON.stringify({ events });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
      } else {
        void fetch("/api/events", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
      }
    } catch {
      // Best-effort; tracking never disrupts the app.
    }
  });

  // page_view on each distinct pathname (guards against double-fire on hydration).
  useEffect(() => {
    if (!flags.tracking) return;
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    buffer.current.push({
      eventType: "page_view",
      routePattern: toPattern(pathname),
      path: pathname,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      referrerPath: document.referrer ? new URL(document.referrer).pathname : undefined,
    });
  }, [pathname]);

  // One delegated click listener; only [data-track] elements are recorded.
  useEffect(() => {
    if (!flags.tracking) return;
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement)?.closest?.("[data-track]") as HTMLElement | null;
      if (!el) return;
      const label = el.getAttribute("data-track") || el.textContent?.trim().slice(0, 80) || undefined;
      buffer.current.push({
        eventType: "click",
        routePattern: toPattern(window.location.pathname),
        path: window.location.pathname,
        elementId: el.id || el.getAttribute("data-track") || undefined,
        elementText: label,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        clickXNorm: window.innerWidth ? e.clientX / window.innerWidth : undefined,
        clickYNorm: window.innerHeight ? e.clientY / window.innerHeight : undefined,
      });
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  // Flush on interval + when the tab is hidden or unloaded.
  useEffect(() => {
    if (!flags.tracking) return;
    const doFlush = flush.current;
    const id = window.setInterval(doFlush, 15_000);
    const onHide = () => doFlush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      doFlush();
    };
  }, []);

  return null;
}
