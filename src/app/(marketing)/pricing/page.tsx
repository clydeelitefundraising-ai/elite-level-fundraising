import type { Metadata } from "next";
import { LinkButton } from "@/components/marketing/Button";
import { FaqList } from "@/components/marketing/FaqList";
import { teamAppLoginUrl } from "@/lib/teamAppLogin";

// /pricing — the free Team App and how fundraising is priced, in one short
// scan. Follows the approved /fundraising, /product, /how-it-works and
// /sponsors direction (Inter 700 sentence-case headings, .mk-fhero hero,
// numbered .mk-fbenefit items, 12px buttons, warm white/cream backgrounds);
// page-only styles are the .mk-prc-* rules in the redesign stylesheet.
//
// Accuracy — every claim is what the product does today:
//  • The Team App is free for every team, with no subscription and no
//    fundraiser required; teams create their own accounts (self-service
//    signup, the same app the nav's "Log in" opens).
//  • Fundraising is switched on and configured with ELF. No fee schedule is
//    published, so the page names no percentage, platform charge, donor fee,
//    saving or result, and never calls fundraising fee-free — terms and any
//    applicable fees are discussed before launch.

export const metadata: Metadata = {
  title: "Pricing | Elite Level Fundraising",
  description:
    "The ELF Team App is free for every team, with no subscription and no fundraiser required. ELF Fundraising is a custom campaign plan, with pricing discussed before launch.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing | Elite Level Fundraising",
    description: "Your team app is free. Your fundraising works harder.",
    type: "website",
  },
};

/** Self-service signup in the Team App — the same app (and environment) the
 *  marketing nav's "Log in" opens. */
const SIGNUP_URL = teamAppLoginUrl(process.env.NEXT_PUBLIC_ELF_DEPLOYMENT_MODE, process.env.NEXT_PUBLIC_ELF_MARKETING_PREVIEW)
  .replace(/\/login$/, "/signup");

const DEMO_URL = "/demo";

const APP_FEATURES = ["Announcements and messaging", "Team calendar", "Attendance", "Rosters"];
const FUNDRAISING_FEATURES = ["Athlete fundraising pages", "Donation tracking", "Campaign reporting", "Support from ELF"];

const BENEFITS = [
  { title: "More money for your goals.", copy: "Give supporters an easy way to contribute to what your athletes need." },
  { title: "Less work for your coaches.", copy: "Keep campaign progress, athlete participation and donations organized in one place." },
  { title: "One platform beyond fundraising.", copy: "Your team can keep using ELF for free after the campaign ends." },
];

const FAQS = [
  {
    q: "Is the Team App really free?",
    a: "Yes. The ELF Team App is free for every team — announcements, messaging, calendar, attendance and rosters. There’s no subscription, and you never have to run a fundraiser to use it.",
  },
  {
    q: "How much does fundraising cost?",
    a: "Each campaign is planned with your program, so pricing depends on what you need. We’ll go over the terms, including any applicable fees, before launch — you’ll know the cost before you commit.",
  },
  {
    q: "Do I have to use ELF Fundraising to use the app?",
    a: "No. Your team can use the Team App for free without ever running an ELF fundraiser.",
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="mk-fhero mk-prc-hero" aria-labelledby="mk-prc-title">
        <div className="mk-container">
          <div className="mk-fhero-copy">
            <span className="mk-eyebrow">Simple pricing. More for your program.</span>
            <h1 id="mk-prc-title" className="mk-fhero-title">
              Your team app is free. Your fundraising works harder.
            </h1>
            <span className="mk-fhero-rule" aria-hidden="true" />
            <p>
              Give your coaches, athletes and parents one place to stay connected &mdash; completely
              free. When you&rsquo;re ready to fundraise, ELF helps you build a campaign designed around
              your program.
            </p>
            <div className="mk-fhero-actions">
              <LinkButton href={SIGNUP_URL} size="lg">Create Your Free Team</LinkButton>
              <a href={DEMO_URL} className="mk-fhero-link">Discuss Fundraising <span aria-hidden="true">&rarr;</span></a>
            </div>
            <p className="mk-prc-trust">No subscription required for the Team App. No fundraising obligation.</p>
          </div>
        </div>
      </section>

      <section className="mk-prc-options" aria-label="Pricing options">
        <div className="mk-container mk-prc-options-grid">
          <article className="mk-prc-card" aria-labelledby="mk-prc-app">
            <h2 id="mk-prc-app" className="mk-prc-card-name">ELF Team App</h2>
            <p className="mk-prc-price">$0</p>
            <p className="mk-prc-for">For every team</p>
            <ul className="mk-prc-list">
              {APP_FEATURES.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <p className="mk-prc-note">No fundraiser required.</p>
            <LinkButton href={SIGNUP_URL} size="lg" block className="mk-prc-cta">Create Your Free Team</LinkButton>
          </article>

          <article className="mk-prc-card" aria-labelledby="mk-prc-fund">
            <h2 id="mk-prc-fund" className="mk-prc-card-name">ELF Fundraising</h2>
            <p className="mk-prc-price mk-prc-price-text">Custom campaign plan</p>
            <p className="mk-prc-for">Pricing discussed before launch</p>
            <ul className="mk-prc-list">
              {FUNDRAISING_FEATURES.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <p className="mk-prc-note">Know the terms before committing.</p>
            <LinkButton href={DEMO_URL} variant="outline" size="lg" block className="mk-prc-cta">Discuss Fundraising</LinkButton>
          </article>
        </div>
      </section>

      <section className="mk-fbenefits mk-prc-benefits" aria-labelledby="mk-prc-why">
        <div className="mk-container">
          <div className="mk-fbenefits-head">
            <span className="mk-eyebrow">Why ELF</span>
            <h2 id="mk-prc-why" className="mk-fbenefits-title mk-prc-title">What your program gets.</h2>
          </div>
          <ol className="mk-fbenefit-grid">
            {BENEFITS.map((b, i) => (
              <li key={b.title} className="mk-fbenefit">
                <span className="mk-fbenefit-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <span className="mk-fbenefit-rule" aria-hidden="true" />
                <div>
                  <h3>{b.title}</h3>
                  <p>{b.copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mk-home-section mk-home-alt mk-fund-faq mk-prc-faq" aria-labelledby="mk-prc-faq-title">
        <div className="mk-container">
          <div className="mk-home-head">
            <span className="mk-eyebrow">FAQ</span>
            <h2 id="mk-prc-faq-title" className="mk-va-title">Pricing questions.</h2>
          </div>
          <FaqList items={FAQS} />
        </div>
      </section>

      <section className="mk-section mk-cta-band mk-prc-close" aria-labelledby="mk-prc-close-title">
        <div className="mk-container-narrow">
          <h2 id="mk-prc-close-title" className="mk-prc-close-title">Ready to give your team more?</h2>
          <p>Start with the free app today. Explore fundraising whenever you&rsquo;re ready.</p>
          <div className="mk-final-actions">
            <LinkButton href={SIGNUP_URL} variant="yellow" size="lg" className="mk-prc-close-btn">Create Your Free Team</LinkButton>
            <LinkButton href={DEMO_URL} variant="outline" size="lg" className="mk-btn-on-dark mk-prc-close-btn">Book a Fundraising Demo</LinkButton>
          </div>
        </div>
      </section>
    </>
  );
}
