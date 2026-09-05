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

// Change 3 (surgical cleanup pass): the trust strip (customer-proof copy,
// the Glendale/PVCC logo chips, "Real teams. Real results.") was removed
// from the homepage entirely — ELF has no approved public
// testimonials/customer-logo endorsements yet, and no fake proof replaces
// it. The hero's own bottom border (see marketing.css) is the "extremely
// minimal visual divider" the removal instructions allow in its place.

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
          Stencil photo tile | ELF brand-statement panel | photo tile.
          Change 2 (surgical cleanup pass): both photo tiles now use a plain
          (non-`fill`) Image sized by its own intrinsic width/height and an
          `align-self: center` opt-out of the grid's default row-stretch
          (see marketing.css) — so neither the artwork's baked-in typography
          nor its composition gets cropped to fit a box shape the images
          were never designed for.
          Change 4: the Coach Bolus quote/attribution/carousel — MOCKUP
          CONTENT that was never an approved real testimonial — has been
          removed entirely and replaced with ELF-owned brand copy below.
          That resolves the standing testimonial-approval warning from
          every prior report; there is nothing left needing approval here. */}
      <section className="mk-mosaic-row mk-row3">
        <div className="mk-mosaic-tile mk-row3-athletics-tile">
          <Image
            src="/marketing/brand/athletics-build-better-people.png"
            alt="Athletics build better people. Stencil-style text painted on a running track's asphalt, with a small cactus graphic."
            width={1462}
            height={1076}
            sizes="(max-width: 900px) 100vw, 33vw"
          />
        </div>

        <div className="mk-mosaic-tile mk-row3-testimonial">
          <h2 className="mk-row3-statement-heading mk-display">
            The season is short.<br />The memories shouldn&rsquo;t be.
          </h2>
          <p className="mk-row3-statement-body">
            Give athletes the opportunity to travel, compete, connect, and make the season count.
          </p>
        </div>

        <div className="mk-mosaic-tile mk-row3-arm-tile">
          <Image
            src="/marketing/brand/give-them-the-season.png"
            alt="Give them the season they earned. Four athletes with gear bags walking away from the camera into a sunset."
            width={549}
            height={553}
            sizes="(max-width: 900px) 100vw, 33vw"
          />
        </div>
      </section>
    </MarketingShell>
  );
}
