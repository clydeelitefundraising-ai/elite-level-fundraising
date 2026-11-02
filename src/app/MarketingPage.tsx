import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MARKETING_NAV_LINKS } from "@/components/marketing/MarketingNav";
import { LinkButton } from "@/components/marketing/Button";
import { StoreBadges } from "@/components/marketing/StoreBadges";
import { teamAppLoginUrl } from "@/lib/teamAppLogin";
import Image from "next/image";

// Homepage — a short summary of ELF in five sections: the football sunset
// hero, the two offerings, real product proof, how to get started, and a
// closing call to action. Follows the approved /fundraising, /product,
// /how-it-works, /sponsors and /pricing direction (Inter 700 sentence-case
// headings, numbered .mk-fbenefit steps, 12px buttons, white/warm cream
// backgrounds); homepage-only styles are the .mk-hm-* rules in the redesign
// stylesheet.
//
// Accuracy: the Team App is free for every team and needs no fundraiser;
// coaches create their own team (self-service signup), while a fundraising
// campaign is set up and switched on with ELF — nothing here suggests
// self-service fundraising activation. Both screenshots are real captures of
// the fictional Sunridge Valley Comets sample (the same ones /how-it-works
// shows). No customers, testimonials, counts or results.

/** Self-service signup in the Team App — the same app (and environment) the
 *  marketing nav's "Log in" opens, and the destination /pricing uses. */
const SIGNUP_URL = teamAppLoginUrl(process.env.NEXT_PUBLIC_ELF_DEPLOYMENT_MODE, process.env.NEXT_PUBLIC_ELF_MARKETING_PREVIEW)
  .replace(/\/login$/, "/signup");

const STEPS = [
  { title: "Choose your starting point.", copy: "Create a free team or talk with ELF about fundraising." },
  { title: "Get your team connected.", copy: "Set up your team and invite coaches, athletes and parents." },
  { title: "Make the season count.", copy: "Manage your program, and launch fundraising with ELF when you’re ready." },
];

export default function MarketingPage() {
  return (
    <MarketingShell navVariant="overlay" navLinks={MARKETING_NAV_LINKS} footerVariant="minimal">
      {/* ── HERO ── the football sunset photograph as the full-width anchor. */}
      <section className="mk-hm-hero" aria-labelledby="mk-hm-title">
        <div className="mk-hm-hero-media">
          <Image
            src="/marketing/brand/hero.png"
            alt="Five football players walking from behind at dusk, arms around each other, stadium lights and palm trees silhouetted against a sunset sky"
            fill
            priority
            sizes="100vw"
            className="mk-hm-hero-img"
          />
          <div className="mk-hm-hero-scrim" aria-hidden="true" />
        </div>
        <div className="mk-container mk-hm-hero-inner">
          <div className="mk-hm-hero-copy">
            <span className="mk-dash-eyebrow mk-dash-eyebrow-on-dark">Fund the season</span>
            <h1 id="mk-hm-title" className="mk-hm-hero-title">
              <span className="mk-hm-line">More for your team.</span>{" "}
              <span className="mk-hm-line">Less on your plate.</span>
            </h1>
            <span className="mk-hm-hero-rule" aria-hidden="true" />
            <p>
              Raise more for your program and keep coaches, athletes and parents connected. ELF
              combines powerful fundraising with a free team management app.
            </p>
            <div className="mk-hm-hero-actions">
              <LinkButton href="/fundraising" size="lg">Explore Fundraising</LinkButton>
              <LinkButton href="/product" variant="outline" size="lg" className="mk-btn-on-dark">Get the Free Team App</LinkButton>
            </div>
          </div>
        </div>
      </section>

      {/* ── TWO SOLUTIONS ── */}
      <section className="mk-hm-solutions" aria-labelledby="mk-hm-solutions-title">
        <div className="mk-container">
          <div className="mk-hm-head">
            <span className="mk-eyebrow">What ELF does</span>
            <h2 id="mk-hm-solutions-title" className="mk-va-title mk-hm-title">One mission. Two ways to move your program forward.</h2>
          </div>
          <div className="mk-hm-panels">
            <article className="mk-hm-panel" aria-labelledby="mk-hm-fund">
              <span className="mk-hm-panel-tag">ELF Fundraising</span>
              <h3 id="mk-hm-fund">Raise more. Give every athlete a role.</h3>
              <p>
                Every athlete gets a personal fundraising page to share by text, email or social media,
                and the whole team follows progress live on the leaderboard. We set up your campaign with
                you.
              </p>
              <LinkButton href="/fundraising" size="lg">Explore Fundraising</LinkButton>
            </article>
            <article className="mk-hm-panel" aria-labelledby="mk-hm-app">
              <span className="mk-hm-panel-tag">ELF Team App</span>
              <h3 id="mk-hm-app">Run your team. Completely free.</h3>
              <p>
                Messaging, calendar, attendance and roster in one app for coaches, athletes and parents.
                Free for every team &mdash; no fundraiser required.
              </p>
              <LinkButton href="/product" variant="dark" size="lg">Explore the Team App</LinkButton>
              <StoreBadges />
            </article>
          </div>
        </div>
      </section>

      {/* ── PRODUCT PROOF ── real captures of the fictional Sunridge sample. */}
      <section className="mk-hm-proof" aria-labelledby="mk-hm-proof-title">
        <div className="mk-container">
          <div className="mk-hm-head">
            <span className="mk-eyebrow">The real product</span>
            <h2 id="mk-hm-proof-title" className="mk-va-title mk-hm-title">Built for the way teams actually work.</h2>
          </div>
          <div className="mk-hm-shots">
            <figure className="mk-hm-shot-wide">
              <div className="mk-fhero-frame">
                <Image
                  src="/marketing/fundraiser-campaign-current.png"
                  alt="The ELF fundraising page for the fictional Sunridge Valley Comets varsity football team: $9,840 raised of a $15,000 goal, 112 donations, 18 days left, and a secure donation form"
                  width={2880}
                  height={1668}
                  sizes="(max-width: 900px) 92vw, 62vw"
                />
              </div>
              <figcaption>
                <strong>ELF Fundraising.</strong>{" "}The team&rsquo;s campaign page, with live progress and secure
                donations.{" "}
                <a href="/fundraising#preview" className="mk-hm-link">See a sample fundraiser <span aria-hidden="true">&rarr;</span></a>
              </figcaption>
            </figure>
            <figure className="mk-hm-shot-phone">
              <div className="mk-phone-frame">
                <Image
                  src="/marketing/team-app-coach-home.png"
                  alt="The ELF Team App Coach Home for the same team: quick actions to post an announcement, add an event, send a message or manage the team, and the next practices"
                  width={780}
                  height={1560}
                  sizes="(max-width: 900px) 64vw, 280px"
                />
              </div>
              <figcaption>
                <strong>ELF Team App.</strong>{" "}Coach Home: announcements, events, messages and practices.{" "}
                <a href="/product#simulator" className="mk-hm-link">Try the Team App <span aria-hidden="true">&rarr;</span></a>
              </figcaption>
            </figure>
          </div>
          <p className="mk-hm-disclosure">Real ELF screens. Sunridge Valley High School is a fictional sample team.</p>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="mk-hm-steps" aria-labelledby="mk-hm-steps-title">
        <div className="mk-container">
          <div className="mk-hm-head mk-hm-steps-head">
            <div>
              <span className="mk-eyebrow">How it works</span>
              <h2 id="mk-hm-steps-title" className="mk-va-title mk-hm-title">Getting started is simple.</h2>
            </div>
            <a href="/how-it-works" className="mk-fhero-link">See the full walkthrough <span aria-hidden="true">&rarr;</span></a>
          </div>
          <ol className="mk-fbenefit-grid">
            {STEPS.map((s, i) => (
              <li key={s.title} className="mk-fbenefit">
                <span className="mk-fbenefit-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <span className="mk-fbenefit-rule" aria-hidden="true" />
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="mk-section mk-cta-band mk-hm-close" aria-labelledby="mk-hm-close-title">
        <div className="mk-container-narrow">
          <h2 id="mk-hm-close-title" className="mk-hm-close-title">Your next great season starts here.</h2>
          <p>Better fundraising. Simpler team management. More opportunities for athletes.</p>
          <div className="mk-final-actions">
            <LinkButton href="/demo" variant="yellow" size="lg" className="mk-hm-close-btn">Book a Fundraising Demo</LinkButton>
            <LinkButton href={SIGNUP_URL} variant="outline" size="lg" className="mk-btn-on-dark mk-hm-close-btn">Create Your Free Team</LinkButton>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
