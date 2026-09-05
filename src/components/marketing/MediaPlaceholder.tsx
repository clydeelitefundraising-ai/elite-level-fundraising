interface MediaPlaceholderProps {
  /** Short label describing what real photography should go here. */
  label: string;
  aspect?: string;
  className?: string;
  /**
   * "default" — a bounded slot (dashed box) for placements where the media
   * sits beside content, e.g. the "What Are We Funding" section.
   * "bleed" — an edge-to-edge slot with crop-mark corners instead of a
   * dashed border, for placements where a real photo is meant to run full
   * bleed and interact with overlapping type (the hero, and every mosaic
   * tile below).
   * Neither look is "finished" — bleed just previews a different future
   * photo treatment, it doesn't add decoration.
   */
  variant?: "default" | "bleed";
  /**
   * Fills its positioned parent (inset: 0) instead of sizing itself via
   * `aspect` — for the mosaic tiles, where the tile's own grid/flex box
   * defines the photo's final crop area and text is overlaid on top of this
   * placeholder via a sibling element with a higher z-index.
   */
  fill?: boolean;
  /**
   * Adds a dark scrim gradient across the slot so overlaid text stays
   * legible once a real photo drops in — mirrors how the hero's placeholder
   * already keeps its overlapping headline readable. Only meaningful when
   * text is actually going to sit on top of this slot.
   */
  scrim?: "left" | "bottom" | "full";
}

// A clearly-marked, presentable stand-in for real sports photography that
// doesn't exist in the repo yet (see Phase 1 audit — no authentic
// documentary sports photos are checked in). NOT a stock image and not an
// invented remote URL: just a styled slot so the layout is complete and a
// real photo can drop in later without touching surrounding markup.
export function MediaPlaceholder({ label, aspect = "4 / 3", className, variant = "default", fill, scrim }: MediaPlaceholderProps) {
  return (
    <div
      className={[
        "mk-media-placeholder",
        variant === "bleed" && "mk-media-placeholder-bleed",
        fill && "mk-media-placeholder-fill",
        scrim && `mk-media-placeholder-scrim-${scrim}`,
        className,
      ].filter(Boolean).join(" ")}
      style={fill ? undefined : { aspectRatio: aspect }}
      role="img"
      aria-label={`Photo placeholder: ${label}`}
    >
      <span className="mk-media-placeholder-tag">Photo slot</span>
      <span className="mk-media-placeholder-label">{label}</span>
    </div>
  );
}
