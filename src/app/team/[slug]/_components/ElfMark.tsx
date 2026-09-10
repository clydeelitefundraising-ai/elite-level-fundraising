/**
 * ELF product-identity mark for the mobile TeamHeader — sits immediately
 * to the left of the team/school logo as a paired brand cluster (see
 * TeamHeader.tsx), not stacked above it.
 *
 * Uses the approved ELF-team-logo-black.png (ELF in black, crown in
 * yellow, TEAM in orange, transparent background) — reads correctly
 * directly on this header's white/warm-white canvas, so unlike the
 * earlier white-on-transparent marketing artwork this replaces, no
 * wrapping dark chip is needed anymore.
 */
export default function ElfMark() {
  return (
    <img
      src="/auth/ELF-team-logo-black.png"
      alt="ELF Team"
      style={{ height: 32, width: "auto", display: "block", flexShrink: 0 }}
    />
  );
}
