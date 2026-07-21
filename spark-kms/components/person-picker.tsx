"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Person = { id: number; name: string };

/**
 * v1.2 (item 2, D9): searchable PIC picker. Autocompletes from the people
 * directory (/api/people) but is NOT a closed list — typing a new name is
 * allowed and creates a directory entry server-side on submit (upsertByName).
 * It is a name field, never a login. Value is the raw string the parent owns.
 */
export function PersonPicker({
  value,
  onChange,
  testid,
  placeholder = "Type or pick a name",
}: {
  value: string;
  onChange: (v: string) => void;
  testid?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<Person[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced directory lookup as the user types.
  useEffect(() => {
    const q = value.trim();
    if (!open) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/people?q=${encodeURIComponent(q)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { people: Person[] };
        setMatches(data.people ?? []);
      } catch {
        // Network hiccup — picker degrades to a plain text field.
      }
    }, 180);
    return () => clearTimeout(t);
  }, [value, open]);

  // Close when clicking outside.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = value.trim().toLowerCase();
  const isNew = q.length > 0 && !matches.some((m) => m.name.toLowerCase() === q);

  return (
    <div className="relative" ref={boxRef}>
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        data-testid={testid}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
      />
      {open && (matches.length > 0 || isNew) && (
        <ul
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
          data-testid={testid ? `${testid}-options` : undefined}
        >
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={cn(
                  "w-full rounded px-2 py-1.5 text-left hover:bg-muted",
                  m.name.toLowerCase() === q && "bg-muted",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(m.name);
                  setOpen(false);
                }}
              >
                {m.name}
              </button>
            </li>
          ))}
          {isNew && (
            <li>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-muted-foreground hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setOpen(false);
                }}
              >
                Add new: <span className="font-medium text-foreground">{value.trim()}</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
