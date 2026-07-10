"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type AdminSection = { id: string; label: string };

/**
 * Sticky in-page directory for the Admin console: click a chip to jump to that
 * section. Sits just below the main app header (top-14) and highlights the
 * section currently in view. Uses a scroll-position spy (with page-bottom
 * detection so the last section can win) plus a short lock after a click, so a
 * clicked chip stays highlighted through the smooth scroll. Sections must carry
 * a matching `id` and `scroll-mt` to clear both sticky bars.
 */
export function AdminSectionNav({ sections }: { sections: AdminSection[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  const lockUntil = useRef(0);

  useEffect(() => {
    const ids = sections.map((s) => s.id);
    const compute = () => {
      if (Date.now() < lockUntil.current) return; // let a click's choice stand
      const doc = document.documentElement;
      // At the very bottom, the last section wins even if it can't reach the top.
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 4) {
        setActive(ids[ids.length - 1]);
        return;
      }
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 130) current = id;
      }
      setActive(current);
    };
    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, [sections]);

  return (
    <nav
      className="sticky top-14 z-10 -mx-4 border-b bg-background/90 px-4 py-2 backdrop-blur"
      aria-label="Admin sections"
    >
      <div className="flex flex-wrap gap-1 text-sm">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById(s.id)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
              setActive(s.id);
              lockUntil.current = Date.now() + 1000; // hold through the scroll
              history.replaceState(null, "", `#${s.id}`);
            }}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              active === s.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
