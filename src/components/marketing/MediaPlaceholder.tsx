interface MediaPlaceholderProps {
  /** Short label describing what real photography should go here. */
  label: string;
  aspect?: string;
  className?: string;
}

// A clearly-marked, presentable stand-in for real sports photography that
// doesn't exist in the repo yet (see Phase 1 audit — no authentic
// documentary sports photos are checked in). NOT a stock image and not an
// invented remote URL: just a styled slot so the layout is complete and a
// real photo can drop in later without touching surrounding markup.
export function MediaPlaceholder({ label, aspect = "4 / 3", className }: MediaPlaceholderProps) {
  return (
    <div
      className={["mk-media-placeholder", className].filter(Boolean).join(" ")}
      style={{ aspectRatio: aspect }}
      role="img"
      aria-label={`Photo placeholder: ${label}`}
    >
      <span className="mk-media-placeholder-tag">Photo slot</span>
      <span className="mk-media-placeholder-label">{label}</span>
    </div>
  );
}
