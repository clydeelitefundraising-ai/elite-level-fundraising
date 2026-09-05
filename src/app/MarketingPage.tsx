import { MarketingShell } from "@/components/marketing/MarketingShell";
import { LinkButton } from "@/components/marketing/Button";
import { ProductPreview } from "@/components/marketing/ProductPreview";
import { CrownMark, ArrowMark } from "@/components/marketing/brand-marks/BrandMarks";
import Image from "next/image";

// Phase 8 (asset integration): the hero photo and four of the mosaic tiles
// below are now real approved production artwork (not MediaPlaceholder
// slots) — see /public/marketing/brand/ and the Phase 8 report for exact
// source files, dimensions, and a flagged native-resolution caveat on two of
// them. MediaPlaceholder itself is untouched/still exported for future use
// elsewhere; it's simply no longer referenced from this page.

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
          <Image
            src="/marketing/brand/hero.png"
            alt="Five football players walking from behind at dusk, arms around each other, stadium lights and palm trees silhouetted against a sunset sky"
            fill
            priority
            sizes="100vw"
            style={{ objectFit: "cover", objectPosition: "center 30%" }}
          />
          <div className="mk-hero-scrim" aria-hidden="true" />
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
          <Image
            src="/marketing/brand/big-things-start-locally.png"
            alt="Big things start locally. Portrait of an athlete with eye-black face paint, dusk stadium in the background."
            fill
            sizes="(max-width: 900px) 100vw, 33vw"
            style={{ objectFit: "cover", objectPosition: "center bottom" }}
          />
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
          Phase 8: this row is now ONE finished composite artwork (the
          orange panel, both photos, and all their copy/marks are baked into
          the image itself) — see the Phase 8 report. The only live element
          is a transparent, percentage-positioned hit-area over the image's
          baked-in "Explore Stories" button, so it still functions as a
          real link once its destination is decided (see the TODO below —
          no dedicated stories/case-studies page exists yet, so this
          deliberately does not navigate anywhere until that's resolved). */}
      <section className="mk-mosaic-row mk-row2-banner">
        <div className="mk-row2-banner-frame">
          <Image
            src="/marketing/brand/real-opportunities-banner.png"
            alt="More than fundraising. Real opportunities for real teams. This is why we raise: a team of athletes celebrating together, and a squad walking toward a sunset with gear bags, captioned Travel, Uniforms, Tournaments, Team dinners, Equipment, and more."
            fill
            sizes="100vw"
            style={{ objectFit: "cover" }}
          />
          {/* TODO(pending user decision): no real "stories" destination exists
              on the site yet (Phase 1 audit routes: /about, /why-elf,
              /product, /fundraising, /communication, /sponsors, /pricing,
              /faq, /contact, /demo, /trust/*, /legal/*). Per explicit
              instruction we are not inventing one — this button is
              keyboard-focusable and announced to screen readers as
              "Explore Stories" but intentionally does not navigate until a
              real destination is approved. */}
          <button
            type="button"
            className="mk-row2-banner-link"
            aria-label="Explore Stories"
          />
        </div>
      </section>

      {/* ── MOSAIC ROW 3 — Athletes Build Better People. ──
          Stencil photo tile | testimonial card | photo tile.
          IMPORTANT: the Coach Bolus quote below is MOCKUP CONTENT, not a
          verified real testimonial — see the Phase 7 report's explicit
          approval warning before this ships with real attribution. */}
      <section className="mk-mosaic-row mk-row3">
        <div className="mk-mosaic-tile mk-mosaic-tile-photo">
          <Image
            src="/marketing/brand/athletics-build-better-people.png"
            alt="Athletics build better people. Stencil-style text painted on a running track's asphalt, with a small cactus graphic."
            fill
            sizes="(max-width: 900px) 100vw, 33vw"
            style={{ objectFit: "cover" }}
          />
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
          <Image
            src="/marketing/brand/give-them-the-season.png"
            alt="Give them the season they earned. Four athletes with gear bags walking away from the camera into a sunset."
            fill
            sizes="(max-width: 900px) 100vw, 33vw"
            style={{ objectFit: "cover", objectPosition: "center top" }}
          />
        </div>
      </section>
    </MarketingShell>
  );
}
