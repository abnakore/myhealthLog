/**
 * Decorative line-art — the faint botanical marks the condition-aware
 * references set behind a hero and above a rail tagline. Pure ornament:
 * aria-hidden at every call site, currentColor and no filters, so each mark
 * takes the palette of whichever mode is active.
 */

/** Rolling hills with two small trees — the elderly rail's parting picture. */
export function HillsArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 88"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 64c22-14 44-16 66-6 18 8 34 8 52-2 20-11 46-13 66-4 12 5 30 8 48 4" />
      <path d="M8 76c30-10 56-11 82-4 26 8 50 7 74-2 20-7 44-8 60-2" />
      <path d="M64 60V44" />
      <path d="m57 46 7-13 7 13M59 54l5-9 5 9" />
      <path d="M172 60V46" />
      <circle cx="172" cy="38" r="8" />
      <path d="M172 46v-8" />
    </svg>
  );
}

/** A seed in a soft ring over two waves — the pregnancy rail's picture. */
export function BloomArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 84"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="60" cy="34" r="20" />
      <path d="M60 50V36" />
      <path d="M60 42c-6-1-9-6-8-11 5 0 9 4 8 11Z" />
      <path d="M60 38c5-1 8-5 7-10-4 0-8 3-7 10Z" />
      <path d="M14 68c14-6 28-6 42 0s28 6 42 0" />
      <path d="M22 76c12-4 24-4 36 0s24 4 36 0" />
    </svg>
  );
}

/** A sprig of leaves — the watermark on the critical condition hero. */
export function LeafBranchArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 168 128"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M16 120C34 92 58 68 92 46c15-10 28-17 44-23" />
      <path d="M62 74C46 72 38 62 40 50c13 0 22 9 22 24Z" />
      <path d="M82 58c10-11 23-13 34-7-4 11-17 15-34 7Z" />
      <path d="M40 94c-14 1-23-7-23-19 13-1 22 7 23 19Z" />
      <path d="M102 36c-9-10-9-22-1-30 9 7 10 20 1 30Z" />
      <path d="M124 24c-4-12 1-22 11-26 5 10 1 21-11 26Z" />
      <circle cx="104" cy="66" r="1.6" />
      <circle cx="90" cy="20" r="1.6" />
    </svg>
  );
}

/** Two long waves — the abstract backdrop beside the pregnancy hero. */
export function WaveArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 180 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M8 46c26-18 52-18 78-2 22 14 46 14 70-2" />
      <path d="M14 68c24-14 48-14 72 0 24 14 48 14 72-2" />
      <path d="M24 92c22-10 44-10 66 2 20 10 40 10 58-2" />
    </svg>
  );
}
