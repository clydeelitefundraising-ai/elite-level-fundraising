import Image from "next/image";
import { authDisplayFont, authHandFont } from "./authDisplayFont";
import type { EntryPhoto } from "./entryPhotos";
import entryStyles from "./authEntry.module.css";
import shellStyles from "./AuthShell.module.css";

// Phase A35 — shared shell for /login, /forgot-password, and
// /reset-password/[token]. Purely presentational: no auth/session logic,
// no routing, no data fetching. Desktop (>=1024px) shows a branded
// editorial panel beside a white card; mobile drops the panel entirely and
// renders the form directly on the ELF dark backdrop, per the reference
// visual (see Phase A35 report for the source image).
//
// /teams keeps its own wider, grid-capable shell (Teams.module.css) since
// it must fit 1-2+ team cards side by side at desktop — it is NOT built on
// this component, but reuses this same authEntry.module.css token/class
// set for color and control consistency.
//
// Phase A36 — the desktop panel now carries real ELF sports photography
// (the `photo` prop, resolved server-side by entryPhotos.ts's deterministic
// daily rotation) as a full-bleed background with a readability scrim, and
// the full raster ELF Team logo image in place of the small crown+text
// mark.
//
// Phase A36 mobile refinement — mobile no longer drops photography
// entirely. A compact ~200px photo hero (entryStyles.mobileHero, same
// photo/scrim/logo, just resized down) replaces the small crown+text
// mobile header. The Wordmark/crown mark is kept only as a defensive
// fallback for the (currently unused) no-photo case.

function Wordmark() {
  return (
    <Image
      src="/auth/elf-team-logo.png"
      alt="ELF Team"
      width={1536}
      height={1024}
      className={entryStyles.brandMarkCompact}
      priority
    />
  );
}

export default function AuthShell({
  headline,
  tagline,
  photo,
  children,
}: {
  headline: string;
  tagline?: string;
  photo?: EntryPhoto;
  children: React.ReactNode;
}) {
  return (
    <div className={`${shellStyles.page} ${authDisplayFont.variable} ${authHandFont.variable}`}>
      {/* Desktop-only branded editorial panel — hidden below 1024px. */}
      <div className={shellStyles.brandPanel}>
        {photo && (
          <>
            <div className={entryStyles.photoFill}>
              <Image src={photo.src} alt={photo.alt} fill sizes="420px" priority />
            </div>
            <div className={entryStyles.photoScrim} />
          </>
        )}

        <div className={entryStyles.photoContent} style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center" }}>
          {/* Full raster brand mark — desktop panel only. Preserves the
              asset's real 1536x1024 aspect ratio via width/height rather
              than stretching to fill the column. */}
          <Image
            src="/auth/elf-team-logo.png"
            alt="ELF Team"
            width={1536}
            height={1024}
            className={entryStyles.brandLogoImage}
            priority
          />
          <p className={entryStyles.handwritten} style={{ fontSize: "1.15rem", marginTop: ".85rem", marginBottom: 0 }}>
            Same team. Bigger opportunities.
          </p>

          {/* entryStyles.headline/.subtext flip to dark text at >=1024px for
              use on the white form card (see authEntry.module.css's "Desktop
              (white card) overrides" media block) — but these two elements sit
              on the dark brandPanel, not the card, so they need an explicit
              color override here to stay readable against the charcoal
              background (and, as of A36, against the photo behind it). */}
          <h1 className={entryStyles.headline} style={{ fontSize: "2.3rem", marginTop: "1.75rem", color: "#FBF6EC" }}>
            {headline}
          </h1>
          <span className={entryStyles.underline} />
          {tagline && (
            <p className={entryStyles.subtext} style={{ marginTop: "1.1rem", maxWidth: 320, color: "rgba(251, 246, 236, 0.72)" }}>
              {tagline}
            </p>
          )}
        </div>
      </div>

      <div className={shellStyles.card}>
        {/* Mobile-only photo hero — hidden at 1024px+ (the desktop brand
            panel carries the full logo image + headline/tagline instead).
            Compact by design: photo + logo only, no headline/tagline
            reproduced here — the functional page title lives in `children`,
            on the near-black background the hero's scrim transitions into. */}
        {photo ? (
          <div className={entryStyles.mobileHero}>
            <div className={entryStyles.photoFill}>
              <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 1023px) 100vw, 0px" priority />
            </div>
            <div className={entryStyles.photoScrim} />
            <div className={entryStyles.mobileHeroContent}>
              <Image
                src="/auth/elf-team-logo.png"
                alt="ELF Team"
                width={1536}
                height={1024}
                className={entryStyles.mobileHeroLogo}
                priority
              />
            </div>
          </div>
        ) : (
          <div className={shellStyles.mobileHeader}>
            <Wordmark />
          </div>
        )}
        <div className={shellStyles.cardInner}>{children}</div>
      </div>
    </div>
  );
}
