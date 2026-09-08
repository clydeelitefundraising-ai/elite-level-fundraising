/**
 * Restrained ELF product-identity mark for the mobile TeamHeader (top
 * left, in its own compact strip above team identity — moved here from
 * the top-right icon tray per a follow-up correction to the Phase 4 final
 * revision). "TEAM = content identity, ELF = product identity."
 * Deliberately smaller than the team avatar (44px).
 *
 * The existing approved ELF logo assets (public/marketing/brand/elf-logo-
 * horizontal.png / elf-logo-stacked.png, from the marketing site redesign)
 * are white artwork on a transparent background — invisible if placed
 * directly on this header's white/warm-white canvas. Rather than
 * inventing a new mark or redesigning the ELF brand, this wraps the
 * EXISTING horizontal artwork in a small dark chip using --shell-backdrop
 * (the same near-black structural color already used for the desktop
 * sidebar) so the white logo reads correctly. No new logo asset, no
 * recolor of the artwork itself.
 */
export default function ElfMark() {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--shell-backdrop)",
        borderRadius: 7,
        padding: "5px 8px",
        height: 26,
        width: "fit-content",
        flexShrink: 0,
      }}
    >
      <img
        src="/marketing/brand/elf-logo-horizontal.png"
        alt=""
        style={{ height: 12, width: "auto", display: "block" }}
      />
    </div>
  );
}
