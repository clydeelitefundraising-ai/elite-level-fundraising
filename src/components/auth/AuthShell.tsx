import { CrownMark } from "@/components/marketing/brand-marks/BrandMarks";
import { authDisplayFont } from "./authDisplayFont";
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

function Wordmark() {
  return (
    <div className={entryStyles.wordmark}>
      <CrownMark className={entryStyles.crown} />
      <span className={entryStyles.wordmarkText}>
        ELF <b>TEAM</b>
      </span>
    </div>
  );
}

export default function AuthShell({
  headline,
  tagline,
  children,
}: {
  headline: string;
  tagline?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${shellStyles.page} ${authDisplayFont.variable}`}>
      {/* Desktop-only branded editorial panel — hidden below 1024px. */}
      <div className={shellStyles.brandPanel}>
        <Wordmark />
        <h1 className={entryStyles.headline} style={{ fontSize: "2.3rem", marginTop: "2rem" }}>
          {headline}
        </h1>
        <span className={entryStyles.underline} />
        {tagline && (
          <p className={entryStyles.subtext} style={{ marginTop: "1.1rem", maxWidth: 320 }}>
            {tagline}
          </p>
        )}
      </div>

      <div className={shellStyles.card}>
        {/* Mobile-only compact header — hidden at 1024px+ (the desktop
            brand panel carries the wordmark instead). */}
        <div className={shellStyles.mobileHeader}>
          <Wordmark />
        </div>
        <div className={shellStyles.cardInner}>{children}</div>
      </div>
    </div>
  );
}
