/**
 * SPARK mark — a four-point geometric spark in the accent color. Inline SVG
 * (no emoji, no raster) so it stays crisp and inherits currentColor where used.
 */
export function SparkMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 1.5c.4 4.9 2.6 7.1 7.5 7.5-4.9.4-7.1 2.6-7.5 7.5-.4-4.9-2.6-7.1-7.5-7.5 4.9-.4 7.1-2.6 7.5-7.5Z"
        fill="var(--primary)"
      />
      <circle cx="18.5" cy="18.5" r="2.4" fill="var(--primary)" opacity="0.5" />
    </svg>
  );
}
