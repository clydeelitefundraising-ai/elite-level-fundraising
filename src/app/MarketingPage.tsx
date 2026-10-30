import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MARKETING_NAV_LINKS } from "@/components/marketing/MarketingNav";
import { LinkButton } from "@/components/marketing/Button";
import { CrownMark } from "@/components/marketing/brand-marks/BrandMarks";
import { StoreBadges } from "@/components/marketing/StoreBadges";
import Image from "next/image";

// Product-focused homepage. The hero (photo, FUND THE SEASON headline,
// callout, actions) is unchanged. Below it, the two finished promotional
// composites that used to fill the page ("Raise More. Do More." and "Real
// Opportunities for Real Teams") are replaced by real, responsive sections
// in accessible HTML: the two offerings, a spotlight on each, how ELF
// works, Community Partners, who ELF is for, the existing closing brand
// band, and a final call to action. Product imagery is real ELF screenshots
// of the Riverside sample program (labelled as such); nothing here invents
// customers, testimonials, counts or results.

const ROLE_PREVIEWS = [
  {
    role: "Coach",
    key: "coach",
    points: ["Post announcements the whole team sees", "Take attendance in a few taps", "Track the fundraiser if you run one"],
  },
  {
    role: "Athlete",
    key: "athlete",
    points: ["See the schedule and team updates", "Share a personal fundraising page", "Follow the team leaderboard"],
  },
  {
    role: "Parent",
    key: "parent",
    points: ["Stay in every conversation with your athlete", "Subscribe to the team calendar", "Support your athlete's fundraiser"],
  },
];

const STEPS = [
  {
    num: "1",
    title: "Talk to us",
    copy: "Book a short demo. We'll walk through ELF using your sport and program as the example.",
  },
  {
    num: "2",
    title: "We set up your team",
    copy: "We build your branded team page and coach account, and get your roster ready — before you touch anything.",
  },
  {
    num: "3",
    title: "Invite your team and go",
    copy: "Families join with a team code. Run the season in the free app, and launch a fundraiser whenever you're ready.",
  },
];

const AUDIENCES = [
  { title: "Coaches", copy: "One place for announcements, messages, attendance and your fundraiser.", href: "/product", cta: "The Team App" },
  { title: "Athletic Directors", copy: "Consistent fundraising pages and team tools across every program.", href: "/how-it-works", cta: "How ELF works" },
  { title: "Athletes", copy: "The schedule, team updates and a fundraising page of their own.", href: "/product", cta: "Athlete view" },
  { title: "Parents", copy: "Included in their athlete's conversations, and always on the calendar.", href: "/product", cta: "Parent view" },
  { title: "Booster Clubs", copy: "Live campaign progress and a clear breakdown of what funds support.", href: "/fundraising", cta: "ELF Fundraising" },
  { title: "Local Businesses", copy: "Become a Community Partner and support the teams in your town.", href: "/sponsors", cta: "Community Partners" },
];

export default function MarketingPage() {
  return (
    <MarketingShell navVariant="overlay" navLinks={MARKETING_NAV_LINKS} footerVariant="minimal">
      {/* ── HERO ── unchanged composition (see marketing.css). */}
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
              <a href="/how-it-works" className="mk-hero-watch">
                <span className="mk-hero-watch-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 11h12.17l-4.58-4.59L13 5l7 7-7 7-1.41-1.41L16.17 13H4z" /></svg>
                </span>
                See how it works
              </a>
            </div>
            <p className="mk-hero-gear-line mk-hand">
              Better gear.<br />More travel.<br />Unforgettable experiences.
            </p>
          </div>
        </div>
      </section>

      {/* ── TWO OFFERINGS ── */}
      <section className="mk-home-section mk-home-offers" aria-labelledby="mk-offers-title">
        <div className="mk-container">
          <div className="mk-home-head">
            <span className="mk-eyebrow">What ELF does</span>
            <h2 id="mk-offers-title" className="mk-display mk-home-title">Two ways ELF helps your program.</h2>
          </div>
          <div className="mk-offer-grid">
            <article className="mk-offer-card mk-offer-fundraising">
              <span className="mk-offer-tag">ELF Fundraising</span>
              <h3>Raise more for the season.</h3>
              <p>
                A branded campaign page for your team, a personal fundraising page and share link for
                every athlete, and a live leaderboard that keeps the whole team moving.
              </p>
              <ul className="mk-check-list">
                <li>Athlete pages and personal share links</li>
                <li>Live progress and leaderboard</li>
                <li>Secure donations powered by Stripe — donors don&rsquo;t need an account</li>
              </ul>
              <div className="mk-offer-actions">
                <LinkButton href="/fundraising">Explore Fundraising</LinkButton>
                <a href="/fundraising#preview" className="mk-text-link">See a sample fundraiser &rarr;</a>
              </div>
            </article>

            <article className="mk-offer-card mk-offer-app">
              <span className="mk-offer-tag mk-offer-tag-free">Free for every team</span>
              <h3>The free ELF Team App.</h3>
              <p>
                Announcements, messages, calendar, attendance and roster in one app for coaches,
                athletes and parents. Free for every team &mdash; no fundraiser required.
              </p>
              <ul className="mk-check-list">
                <li>Team announcements and direct messages</li>
                <li>Calendar, attendance and roster</li>
                <li>iPhone, Android and the web</li>
              </ul>
              <div className="mk-offer-actions">
                <LinkButton href="/product" variant="dark">Explore the Team App</LinkButton>
              </div>
              <StoreBadges />
            </article>
          </div>
        </div>
      </section>

      {/* ── FUNDRAISING SPOTLIGHT ── */}
      <section className="mk-home-section mk-home-spotlight mk-home-alt" aria-labelledby="mk-fund-spot-title">
        <div className="mk-container mk-spotlight-grid">
          <div className="mk-spotlight-copy">
            <span className="mk-eyebrow">ELF Fundraising</span>
            <h2 id="mk-fund-spot-title" className="mk-home-title-sm">A fundraiser families actually want to share.</h2>
            <p>
              Every athlete gets a page of their own. Donations show up on the team&rsquo;s live
              leaderboard, and families can see exactly what the money supports before they give.
            </p>
            <ul className="mk-check-list">
              <li>One shareable campaign page per team</li>
              <li>Fund-use breakdown donors can see</li>
              <li>Coach dashboard to track progress</li>
            </ul>
            <div className="mk-offer-actions">
              <LinkButton href="/fundraising#preview">Explore the sample fundraiser</LinkButton>
              <a href="/demo" className="mk-text-link">Book a demo &rarr;</a>
            </div>
          </div>
          <figure className="mk-shot-stack">
            <div className="mk-shot mk-shot-wide">
              <Image
                src="/marketing/campaign-hero.png"
                alt="A real ELF campaign page for a sample football program, showing the goal, days left and donor count"
                width={1440}
                height={620}
                sizes="(max-width: 900px) 100vw, 560px"
              />
            </div>
            <div className="mk-shot mk-shot-inset">
              <Image
                src="/marketing/leaderboard.png"
                alt="A real ELF athlete leaderboard and donation form, ranked by amount raised"
                width={1002}
                height={660}
                sizes="(max-width: 900px) 70vw, 320px"
              />
            </div>
            <figcaption className="mk-shot-caption">Real ELF screens. Riverside High School is a sample program.</figcaption>
          </figure>
        </div>
      </section>

      {/* ── TEAM APP SPOTLIGHT ── */}
      <section className="mk-home-section mk-home-spotlight" aria-labelledby="mk-app-spot-title">
        <div className="mk-container mk-spotlight-grid mk-spotlight-reverse">
          <div className="mk-spotlight-copy">
            <span className="mk-eyebrow">The free ELF Team App</span>
            <h2 id="mk-app-spot-title" className="mk-home-title-sm">One app for coaches, athletes and parents.</h2>
            <p>
              Everyone sees the version of the team they need. Try each view in the interactive
              preview &mdash; it runs on fictional sample data, right in your browser.
            </p>
            <ul className="mk-role-cards">
              {ROLE_PREVIEWS.map((r) => (
                <li key={r.key} className="mk-role-card">
                  <h3>{r.role}</h3>
                  <ul>
                    {r.points.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                  <a href={`/product?role=${r.key}#simulator`} className="mk-text-link">Try the {r.role.toLowerCase()} view &rarr;</a>
                </li>
              ))}
            </ul>
          </div>
          <figure className="mk-phone-shot">
            <div className="mk-phone-frame">
              <Image
                src="/marketing/communications.png"
                alt="The real Team Communications screen in the ELF Team App, showing coach announcements about practice and an away game"
                width={720}
                height={900}
                sizes="(max-width: 900px) 70vw, 320px"
              />
            </div>
            <figcaption className="mk-shot-caption">The real ELF Team App.</figcaption>
          </figure>
        </div>
      </section>

      {/* ── HOW ELF WORKS ── */}
      <section className="mk-home-section mk-home-alt" aria-labelledby="mk-how-title">
        <div className="mk-container">
          <div className="mk-home-head">
            <span className="mk-eyebrow">How ELF works</span>
            <h2 id="mk-how-title" className="mk-display mk-home-title">Up and running in three steps.</h2>
          </div>
          <ol className="mk-three-steps">
            {STEPS.map((s) => (
              <li key={s.num}>
                <span className="mk-three-num" aria-hidden="true">{s.num}</span>
                <h3>{s.title}</h3>
                <p>{s.copy}</p>
              </li>
            ))}
          </ol>
          <p className="mk-home-more">
            <a href="/how-it-works" className="mk-text-link">See the full season walkthrough &rarr;</a>
          </p>
        </div>
      </section>

      {/* ── COMMUNITY PARTNERS ── */}
      <section className="mk-home-section mk-home-partners" aria-labelledby="mk-partners-title">
        <div className="mk-container mk-partners-band">
          <div>
            <span className="mk-eyebrow mk-eyebrow-on-dark">For local businesses</span>
            <h2 id="mk-partners-title" className="mk-home-title-sm">Get in front of the families who show up every week.</h2>
            <p>
              ELF Community Partners appear in the Team App and on the public fundraising pages of the
              teams they support &mdash; with your logo, your name and a link to your website.
            </p>
          </div>
          <div className="mk-partners-actions">
            <LinkButton href="/sponsors#inquire" variant="yellow" size="lg">Become a Community Partner</LinkButton>
            <a href="/sponsors" className="mk-text-link mk-text-link-on-dark">How partnerships work &rarr;</a>
          </div>
        </div>
      </section>

      {/* ── WHO ELF IS FOR ── */}
      <section className="mk-home-section" aria-labelledby="mk-audience-title">
        <div className="mk-container">
          <div className="mk-home-head">
            <span className="mk-eyebrow">Who ELF is for</span>
            <h2 id="mk-audience-title" className="mk-display mk-home-title">Built for the whole program.</h2>
          </div>
          <ul className="mk-audience-grid">
            {AUDIENCES.map((a) => (
              <li key={a.title} className="mk-audience-card">
                <h3>{a.title}</h3>
                <p>{a.copy}</p>
                <a href={a.href} className="mk-text-link">{a.cta} &rarr;</a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── CLOSING BRAND BAND ── (the existing "Athletes Build Better
          People" row, unchanged) */}
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

      {/* ── FINAL CTA ── */}
      <section className="mk-section mk-cta-band mk-home-final">
        <div className="mk-container-narrow">
          <h2>Ready to fund the season?</h2>
          <p>Book a free demo for your program, or ask about becoming a Community Partner.</p>
          <div className="mk-final-actions">
            <LinkButton href="/demo" variant="yellow" size="lg">Book a Free Demo</LinkButton>
            <LinkButton href="/sponsors#inquire" variant="outline" size="lg" className="mk-btn-on-dark">Partner With ELF</LinkButton>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
