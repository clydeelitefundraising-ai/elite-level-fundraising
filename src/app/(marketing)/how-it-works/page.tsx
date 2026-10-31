import type { Metadata } from "next";
import Image from "next/image";
import { LinkButton } from "@/components/marketing/Button";
import { teamAppLoginUrl } from "@/lib/teamAppLogin";

// /how-it-works — ELF in about 30 seconds: what the free Team App does, how a
// team gets started on its own, and how fundraising connects when the team
// is ready. Follows the approved /fundraising and /product direction
// (Inter 700 sentence-case headings, .mk-fhero hero, numbered .mk-fbenefit
// steps, 12px buttons, warm white/cream backgrounds); page-only styles are
// the .mk-hiw-* rules in the redesign stylesheet.
//
// Every picture is a real capture: the Coach Home and Team Communications of
// the fictional Sunridge Valley Comets QA team, and the fictional sample
// fundraising page (the same one /fundraising shows). Accuracy: the Team App
// is free and needs no fundraiser; teams create their own accounts; ELF
// works with the team to set up a fundraiser — no setup call is required to
// start.

export const metadata: Metadata = {
  title: "How It Works | Elite Level Fundraising",
  description:
    "How ELF works: set up your team for free, keep coaches, athletes and parents connected all season, and fundraise with ELF when you're ready.",
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: "How It Works | Elite Level Fundraising",
    description: "Set up your team, stay connected all season, and fundraise when you're ready — all in one free app.",
    type: "website",
  },
};

/** Self-service signup in the Team App — the same app (and environment) the
 *  marketing nav's "Log in" opens. */
const SIGNUP_URL = teamAppLoginUrl(process.env.NEXT_PUBLIC_ELF_DEPLOYMENT_MODE, process.env.NEXT_PUBLIC_ELF_MARKETING_PREVIEW)
  .replace(/\/login$/, "/signup");

const STEPS = [
  {
    title: "Set up your team.",
    copy: "Create your team, invite coaches, athletes and parents, and bring everyone into one place.",
  },
  {
    title: "Stay connected all season.",
    copy: "Manage announcements, messages, calendars, attendance and team updates without juggling multiple apps.",
  },
  {
    title: "Fundraise when you’re ready.",
    copy: "Work with ELF to launch a campaign. Athletes share their pages, supporters donate securely, and coaches track progress.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="mk-fhero mk-hiw-hero" aria-labelledby="mk-hiw-title">
        <div className="mk-container mk-fhero-grid">
          <div className="mk-fhero-copy">
            <span className="mk-free-pill">Free for every team &middot; No fundraiser required</span>
            <h1 id="mk-hiw-title" className="mk-fhero-title">
              Everything your team needs. Nothing it doesn&rsquo;t.
            </h1>
            <span className="mk-fhero-rule" aria-hidden="true" />
            <p>
              ELF brings your coaches, athletes and parents together in one free app. When it&rsquo;s
              time to fundraise, everything is already connected.
            </p>
            <div className="mk-fhero-actions">
              <LinkButton href="/product" size="lg">Explore the Team App</LinkButton>
              <a href="/fundraising" className="mk-fhero-link">See how fundraising works <span aria-hidden="true">&rarr;</span></a>
            </div>
          </div>

          <figure className="mk-hiw-visual">
            <div className="mk-hiw-stage">
              <div className="mk-fhero-frame mk-hiw-browser">
                {/* The fictional sample fundraising page (same capture as /fundraising). */}
                <Image
                  src="/marketing/fundraiser-campaign-current.png"
                  alt="The fundraising page for the fictional Sunridge Valley Comets varsity football team: $9,840 raised of a $15,000 goal, 112 donations, 18 days left, and a secure donation form"
                  width={2880}
                  height={1668}
                  priority
                  sizes="(max-width: 900px) 92vw, 46vw"
                />
              </div>
              <div className="mk-phone-frame mk-hiw-phone">
                {/* The real Coach Home of the fictional Sunridge Valley Comets QA team. */}
                <Image
                  src="/marketing/team-app-coach-home.png"
                  alt="The ELF Team App Coach Home for the same team: quick actions to post an announcement, add an event, send a message or manage the team, and the next practices"
                  width={780}
                  height={1560}
                  priority
                  sizes="(max-width: 900px) 34vw, 15vw"
                />
              </div>
            </div>
            <figcaption className="mk-fhero-caption">
              The real ELF Team App and fundraising page. Sunridge Valley High School is a fictional sample team.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="mk-hiw-steps" aria-labelledby="mk-hiw-steps-title">
        <div className="mk-container mk-hiw-steps-grid">
          <div>
            <span className="mk-eyebrow">How it works</span>
            <h2 id="mk-hiw-steps-title" className="mk-va-title mk-hiw-steps-title">Three steps. One connected season.</h2>
            <ol className="mk-hiw-list">
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
          <figure className="mk-hiw-steps-shot">
            <div className="mk-phone-frame">
              {/* Real Team Communications of the fictional Sunridge Valley Comets QA team. */}
              <Image
                src="/marketing/team-app-communications.png"
                alt="Team Communications in the ELF Team App: a pinned update from the head coach moving Thursday practice to 4:30, and an update for parents about the team pasta dinner"
                width={780}
                height={1560}
                sizes="(max-width: 900px) 70vw, 300px"
              />
            </div>
            <figcaption className="mk-fhero-caption">Team updates in the real ELF Team App.</figcaption>
          </figure>
        </div>
      </section>

      <section className="mk-hiw-close" aria-labelledby="mk-hiw-close-title">
        <div className="mk-container-narrow">
          <h2 id="mk-hiw-close-title" className="mk-va-title mk-hiw-close-title">Ready to bring your team together?</h2>
          <p>
            Create your team for free &mdash; no fundraiser required. When your program is ready to
            raise money, ELF Fundraising works inside the same app.
          </p>
          <div className="mk-final-actions">
            <LinkButton href={SIGNUP_URL} size="lg">Create Your Free Team</LinkButton>
            <LinkButton href="/fundraising" variant="outline" size="lg">Explore ELF Fundraising</LinkButton>
          </div>
          <p className="mk-hiw-close-note">
            Prefer a guided walkthrough? <a href="/demo">Book a free demo</a>.
          </p>
        </div>
      </section>
    </>
  );
}
