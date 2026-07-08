/**
 * Break a follow-up note into separate action items.
 *
 * A follow-up often lists several tasks — either on separate lines, or as a
 * numbered/bulleted list (even inline: "1. do X 2. do Y"). Each piece becomes
 * its own action item. A plain follow-up with no list structure stays a single
 * item, and a number that's just part of a sentence ("need 2 quotes") must not
 * trigger a split.
 *
 * Pure and side-effect free so it can be unit-tested and reused by both the
 * manual submit path and the bulk-upload path.
 */

// A list marker at the START of a line/segment: "1." / "2)" / "-" / "•" / "*".
const LEADING_MARKER = /^\s*(?:\d{1,2}[.)]|[-–—•*])\s*/;

// An inline marker that looks like the start of a new list item: a number with
// a "." or ")", or a bullet char, bounded by whitespace. Restricted to these so
// mid-sentence numbers and hyphenated words don't get split.
const INLINE_MARKER = /(?:^|\s)(?:\d{1,2}[.)]|•)\s+/g;

export function splitFollowUp(text: string | null | undefined): string[] {
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  let normalized = trimmed;

  // Only treat inline markers as a list when there are at least two of them —
  // one leading "1." is just a prefix, not a multi-item list.
  const inline = trimmed.match(INLINE_MARKER);
  if (inline && inline.length >= 2) {
    // Insert a line break before each inline marker that follows real content.
    normalized = trimmed.replace(
      /(\S)\s+((?:\d{1,2}[.)]|•)\s+)/g,
      "$1\n$2",
    );
  }

  return normalized
    .split(/\r?\n+/)
    .map((line) => line.replace(LEADING_MARKER, "").trim())
    .filter(Boolean);
}
