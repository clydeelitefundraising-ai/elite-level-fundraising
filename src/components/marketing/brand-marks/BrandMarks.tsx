interface MarkProps {
  className?: string;
}

// ELF's small original brand-mark vocabulary. Deliberately simple line/shape
// construction (no icon-library look, no emoji) so these read the same way
// at 24px in a nav as they would printed on a sticker or a jersey tag.
// `stroke="currentColor"` throughout so each mark inherits whatever text
// color its section already uses — no hardcoded palette values here.

/** Simple 3-point crown — echoes the small mark already used elsewhere in
 * the ELF wordmark. Signifies achievement/opportunity, not royalty. */
export function CrownMark({ className }: MarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 17 L3 8 L8 12 L12 5 L16 12 L21 8 L20 17 Z" />
      <path d="M4 17 L20 17" />
    </svg>
  );
}

/** A single saguaro silhouette — the one direct Arizona/desert identity
 * signal in the system. Used sparingly, one per viewport max. */
export function CactusMark({ className }: MarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21 V6 a2.5 2.5 0 0 1 5 0 v3" />
      <path d="M12 12 H8.5 a2 2 0 0 1 -2 -2 V6" />
      <path d="M12 15 H15.5 a2 2 0 0 0 2 -2 V10" />
      <path d="M8 21 H16" />
    </svg>
  );
}

/** A loose, single-stroke sketched arrow — intentionally not a clean
 * geometric arrowhead, so it reads as an annotation someone drew, not a UI
 * icon. Points right-to-down by default; rotate via className/style at the
 * call site for other directions. */
export function ArrowMark({ className }: MarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6 C 14 4, 24 9, 30 18 C 32.5 21.5, 34 24.5, 35 27" />
      <path d="M25 25 C 28.5 26.5, 32.5 27.5, 36.5 27.5" />
      <path d="M36.5 27.5 C 37.5 23.8, 39 20.2, 41.5 17" />
    </svg>
  );
}
