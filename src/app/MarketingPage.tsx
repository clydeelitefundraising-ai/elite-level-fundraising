import { MarketingShell } from "@/components/marketing/MarketingShell";
import { LinkButton } from "@/components/marketing/Button";
import { ProductPreview } from "@/components/marketing/ProductPreview";
import { MediaPlaceholder } from "@/components/marketing/MediaPlaceholder";
import { CrownMark, CactusMark, ArrowMark } from "@/components/marketing/brand-marks/BrandMarks";
import Image from "next/image";

// Mockup-fidelity homepage structure (Phase 7): Header/Nav -> Hero ->
// Trust strip -> three mosaic rows -> Footer. This intentionally REMOVES
// the previous How It Works / standalone Fundraising / Communication /
// Sponsors / Coaches-ADs-Boosters / homepage FAQ / final-CTA sections from
// the HOMEPAGE ONLY — every one of those topics still has its own real,
// unchanged page (/product, /fundraising, /communication, /sponsors,
// /pricing, /faq) reachable from nav/footer. See the Phase 7 report for the
// full rationale and the two content gaps this creates (no page currently
// hosts the exact "How It Works" 4-step content or the Coaches/ADs/Booster
// persona breakdown outside the homepage they used to live on).

// Homepage nav uses the mockup's exact wording — every other marketing page
// keeps the existing NAV_LINKS in MarketingNav.tsx untouched. Mapped to the
// closest existing real route where the mockup's label has no exact match
// (see Phase 7 report point on nav mapping):
//   HOW IT WORKS -> /product   (closest platform-overview page; no
//                                dedicated "how it works" route exists)
//   TEAMS        -> /communication (team management/roster/messaging)
//   SPONSORS     -> /sponsors  (exact match)
//   PRICING      -> /pricing   (exact match)
//   RESOURCES    -> /faq       (closest "resource-ish" existing page)
const HOME_NAV_LINKS = [
  { href: "/product", label: "How It Works" },
  { href: "/communication", label: "Teams" },
  { href: "/sponsors", label: "Sponsors" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "Resources" },
];

// Real, checked-in school/partner logos only (Q2 approved) — see Phase 3
// report for a flagged third asset (public/univeristy-logo.png) deliberately
// excluded because it's generic stock crest art, not a real ELF partner.
// A flex-wrap strip (not a fixed 6-up grid, unlike the mockup's illustrated
// mascot icons) so it expands cleanly as more real programs are added.
const TRUST_LOGOS = [
  { src: "/Glendale-logo.png", alt: "Glendale Cardinals", width: 390, height: 129 },
  { src: "/pvcc-logo.png", alt: "Paradise Valley Community College", width: 1569, height: 340 },
];

export default function MarketingPage() {
  return (
    <MarketingShell navVariant="overlay" navLinks={HOME_NAV_LINKS} footerVariant="minimal">
      {/* ── HERO ──
          Full-bleed photo, nav and headline sitting directly on top of it as
          one composition — not a side-by-side split. See marketing.css for
          the mockup-fidelity notes. */}
      <section className="mk-hero">
        <div className="mk-hero-media">
          <MediaPlaceholder
            label="Five athletes from behind at dusk, arms around each other, stadium/track in the background — one jersey reads MORE THAN A TEAM."
            variant="bleed"
            fill
            scrim="left"
          />
        </div>

        <span className="mk-hero-callout mk-hand">
          <CrownMark className="mk-hero-crown" />
          Same grind. Bigger opportunities.
        </span>

        <div className="mk-container mk-hero-inner">
          <div className="mk-hero-copy">
            <h1>
              Fund<br />
              the<br />
              <span className="mk-marker-underline">season.</span>
            </h1>
            <p className="mk-hero-sub">Tools. Community. Real impact.</p>
            <div className="mk-hero-actions">
              <LinkButton href="/demo" variant="yellow" size="lg">Get Started &rarr;</LinkButton>
              <a href="/product" className="mk-hero-watch">
                <span className="mk-hero-watch-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4l14 8-14 8z" /></svg>
                </span>
                Watch video
              </a>
            </div>
            <p className="mk-hero-gear-line mk-hand">
              Better gear.<br />More travel.<br />Unforgettable experiences.
            </p>
          </div>
        </div>
      </section>

      {/* ── TRUST STRIP ──
          One compact row: eyebrow, real logos, divider, tagline — no
          separate feature-badge caption competing with the hero. */}
      <section className="mk-trust-band">
        <div className="mk-container mk-trust-row">
          <p className="mk-trust-eyebrow">Trusted by programs across Arizona and beyond.</p>
          <div className="mk-trust-logos">
            {TRUST_LOGOS.map((logo) => (
              <span className="mk-trust-logo-chip" key={logo.src}>
                <Image src={logo.src} alt={logo.alt} width={logo.width} height={logo.height} style={{ height: "100%", width: "auto" }} />
              </span>
            ))}
          </div>
          <p className="mk-trust-tagline mk-display">
            Real teams.<br /><span className="mk-marker-underline">Real results.</span>
          </p>
        </div>
      </section>

      {/* ── MOSAIC ROW 1 — Raise More. Do More. ──
          Photo tile | copy tile | phone tile, edge-to-edge, sharing one
          off-white field. Real ELF screenshots stand in for the mockup's
          fictional phone UI, arranged in the same overlapping composition. */}
      <section className="mk-mosaic-row mk-row1">
        <div className="mk-mosaic-tile mk-mosaic-tile-photo">
          <MediaPlaceholder
            label="Athlete portrait, face paint, close crop, dusk — documentary style, not posed"
            fill
            scrim="bottom"
          />
          <div className="mk-row1-photo-copy mk-hand">
            <CrownMark className="mk-row1-photo-crown" />
            Big things<br />start<br /><span className="mk-marker-underline">locally.</span>
          </div>
        </div>

        <div className="mk-mosaic-tile mk-row1-copy">
          <h2 className="mk-display">Raise more.<br /><span className="mk-marker-underline">Do more.</span></h2>
          <p>
            ELF makes it easy for high school teams to raise money, manage their program, and keep
            everyone connected &mdash; all in one place.
          </p>
          <div>
            <LinkButton href="/product" variant="dark">See How It Works &rarr;</LinkButton>
          </div>
        </div>

        <div className="mk-mosaic-tile">
          <div className="mk-row1-phones">
            <span className="mk-row1-tag mk-display">Built for teams</span>
            <ArrowMark className="mk-row1-arrow" />
            <ProductPreview
              label="Athlete leaderboard"
              image={{ src: "/marketing/leaderboard.png", alt: "Real athlete leaderboard and donation form from a demo Elite Level Fundraising campaign page, ranked by amount raised", width: 1002, height: 660 }}
              demoNote="Demo data — Riverside High School is a sample program, not a real customer."
            />
            <ProductPreview
              label="Team communications"
              image={{ src: "/marketing/communications.png", alt: "Real Team Communications view in the Elite Level Fundraising Team App, showing coach announcements", width: 720, height: 900 }}
            />
          </div>
        </div>
      </section>

      {/* ── MOSAIC ROW 2 — Real Opportunities for Real Teams. ──
          Orange copy tile | photo tile | photo tile. Absorbs the previous
          standalone "What Are We Funding" section's content (eyebrow +
          funding categories) into this row's copy/caption, per the mockup. */}
      <section className="mk-mosaic-row mk-row2">
        <div className="mk-mosaic-tile mk-row2-copy">
          <span className="mk-eyebrow">
            <CactusMark className="mk-row2-cactus" />
            More than fundraising
          </span>
          <h2 className="mk-display">Real opportunities<br />for real teams.</h2>
          <div>
            <LinkButton href="/why-elf" variant="dark">Explore Stories &rarr;</LinkButton>
          </div>
        </div>

        <div className="mk-mosaic-tile mk-mosaic-tile-photo">
          <MediaPlaceholder
            label="Team celebration — athletes in ELF jerseys, close together, laughing"
            fill
            scrim="bottom"
          />
          <div className="mk-row2-photo-copy mk-hand">
            <span className="mk-row2-crowns" aria-hidden="true">
              <CrownMark /><CrownMark />
            </span>
            <br />Good people.<br />Big impact.
          </div>
        </div>

        <div className="mk-mosaic-tile mk-mosaic-tile-photo">
          <MediaPlaceholder
            label="Silhouetted palm trees against a dusk sky"
            fill
            scrim="bottom"
          />
          <p className="mk-row2-photo-copy mk-row2-fund-copy">
            Travel. Uniforms. Tournaments.<br />Team dinners. <span className="mk-marker-underline">Equipment.</span><br />And more.
          </p>
        </div>
      </section>

      {/* ── MOSAIC ROW 3 — Athletes Build Better People. ──
          Stencil photo tile | testimonial card | photo tile.
          IMPORTANT: the Coach Bolus quote below is MOCKUP CONTENT, not a
          verified real testimonial — see the Phase 7 report's explicit
          approval warning before this ships with real attribution. */}
      <section className="mk-mosaic-row mk-row3">
        <div className="mk-mosaic-tile mk-mosaic-tile-photo">
          <MediaPlaceholder
            label="Close-up track/asphalt texture with lane paint"
            fill
            scrim="bottom"
          />
          <div className="mk-row3-stencil-copy">
            <p className="mk-stencil">Athletes<br />build better<br />people.</p>
            <CactusMark className="mk-row3-cactus" />
          </div>
        </div>

        <div className="mk-mosaic-tile mk-row3-testimonial">
          <blockquote className="mk-row3-quote">
            &ldquo;ELF took a huge weight off our coaching staff and helped us{" "}
            <strong>raise more than</strong> we ever have. <strong>Our kids got to</strong> travel,
            compete, and create memories that will last a lifetime.&rdquo;
          </blockquote>
          <p className="mk-row3-attribution">
            &mdash; Coach Bolus
            <span>O&rsquo;Connor High School Track</span>
          </p>
          <div className="mk-row3-dots" aria-hidden="true">
            <button type="button" aria-label="Previous"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg></button>
            <span /><span /><span /><span />
            <button type="button" aria-label="Next"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg></button>
          </div>
        </div>

        <div className="mk-mosaic-tile mk-mosaic-tile-photo mk-row3-arm-tile">
          <MediaPlaceholder
            label="Close-up of an arm/hand gripping a relay baton, bokeh background"
            fill
            scrim="bottom"
          />
          <p className="mk-row3-photo-copy mk-hand">More sports.<br />Brighter<br />futures.</p>
        </div>
      </section>
    </MarketingShell>
  );
}
