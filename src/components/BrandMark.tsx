// Shared ELF brand components — replaces the old desert-logo image
// (public/ELF.LOGO.png and the PWA icon set) across the app. Current ELF
// identity is a typographic wordmark, not a reusable image asset (see the
// marketing site's actual nav treatment, src/components/marketing/), so
// these render text/CSS rather than an <img>. Colors are the exact tokens
// the marketing site itself uses (marketing-tokens.css): navy `#0B1E3D`
// and brass `#7A5F22`. These are ELF's OWN platform brand colors — never
// theme-able by a team's campaign_settings.primary_color, unlike the rest
// of the app's team-customizable accents.
const INK = "#0B1E3D";
const ACCENT_INK = "#7A5F22";

// Compact square monogram badge — for icon-only slots (small header
// badges, splash screens, or nav/footer/powered-by rows that already have
// an adjacent "Elite Level Fundraising" text label doing the naming).
// White badge reads clearly against the navy backgrounds these all sit on.
export function ElfMark({
  size = 36,
  radius,
  className,
  style,
}: {
  size?: number;
  radius?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={className}
      role="img"
      aria-label="Elite Level Fundraising"
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.28),
        background: "#fff",
        color: INK,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: size * 0.34,
        letterSpacing: "-0.02em",
        flexShrink: 0,
        ...style,
      }}
    >
      ELF
    </div>
  );
}

// Full text lockup — for slots that previously showed the logo image
// ALONE, with no adjacent brand-name text (so the name still needs to
// read on its own). tone="light" is the dark-background variant.
export function ElfWordmark({
  tone = "dark",
  size = "md",
  className,
}: {
  tone?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const fontSize = { sm: ".78rem", md: "1.15rem", lg: "1.4rem" }[size];
  const ink = tone === "light" ? "#fff" : INK;
  const accent = tone === "light" ? "rgba(255,255,255,.78)" : ACCENT_INK;
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        fontWeight: 800,
        fontSize,
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <span style={{ color: ink }}>ELITE LEVEL&nbsp;</span>
      <span style={{ color: accent }}>FUNDRAISING</span>
    </span>
  );
}
