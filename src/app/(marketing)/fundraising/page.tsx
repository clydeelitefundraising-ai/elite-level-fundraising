import type { Metadata } from "next";
import Image from "next/image";
import { LinkButton } from "@/components/marketing/Button";
import { FaqList } from "@/components/marketing/FaqList";
import { FundraisingPreview } from "@/components/marketing/demo/FundraisingPreview";
import { previewLeadReadiness } from "@/lib/marketing/previewLead";

export const metadata: Metadata = {
  title: "Fundraising | Elite Level Fundraising",
  description:
    "ELF Fundraising gives every athlete a personal fundraising page and share link, a live team leaderboard, secure Stripe-powered donations and a coach dashboard. Explore a sample fundraiser.",
  alternates: { canonical: "/fundraising" },
  openGraph: {
    title: "ELF Fundraising | Elite Level Fundraising",
    description: "Athlete pages, live leaderboards and secure donations — explore a sample fundraiser.",
    type: "website",
  },
};

// The preview's lead gate only goes live when every dependency is in place
// (durable rate limiting, business inbox, consent migration switch); until
// then the fictional sample is shown without a gate. Evaluated at build.
const GATE_ENABLED = previewLeadReadiness(process.env).ready;

const BENEFITS = [
  { title: "A page for every athlete", copy: "Every athlete gets a personal fundraising page and their own share link — easy to text, post or email to family and friends." },
  { title: "Live progress and leaderboard", copy: "The campaign page shows progress toward the goal in real time, and the leaderboard turns giving into visible team momentum." },
  { title: "Secure, simple donations", copy: "Donations are processed by Stripe. Donors give in a few taps with no account to create, and ELF never stores card details." },
  { title: "Clear about where money goes", copy: "Coaches list what the season's funds are for — travel, equipment, uniforms — so donors see exactly what they're supporting." },
  { title: "Coach dashboard and reporting", copy: "Coaches see what's been raised, by whom, and how close each athlete is to their goal — no spreadsheet to keep up." },
  { title: "Community Partners on your page", copy: "Local businesses supporting your program can appear on your public fundraising page as Community Partners." },
];

const PROCESS = [
  { num: "1", title: "Set up", copy: "We build your branded campaign page with your goal, deadline and what the funds are for. Athletes are added from your roster." },
  { num: "2", title: "Share", copy: "Athletes and families share personal links by text, email and social media. Donors give on any device." },
  { num: "3", title: "Track", copy: "Watch progress and the leaderboard update as donations come in, from the campaign page or the coach dashboard." },
  { num: "4", title: "Report", copy: "See totals by athlete and for the team, so coaches, ADs and boosters always know where things stand." },
];

const FAQS = [
  { q: "Does my team have to run a fundraiser to use ELF?", a: "No. The ELF Team App is free for every team, whether or not you run a fundraiser. ELF Fundraising is there when your program is ready to raise money." },
  { q: "How are donations processed?", a: "All donations are processed through Stripe. Elite Level Fundraising does not store card details, and donors don't need an account to give." },
  { q: "How quickly do funds reach the program?", a: "Funds are handled through Stripe's standard payout process. Exact timing depends on your Stripe account configuration — we'll walk through this during your demo." },
  { q: "Can coaches fundraise alongside athletes?", a: "Yes, when the program turns it on, coaches can appear on the leaderboard with their own pages, the same way athletes do." },
  { q: "What does it cost?", a: "Pricing for fundraising is tailored to your program. We won't publish a number we can't stand behind — ask during the demo and you'll get a straight answer." },
  { q: "Is the sample fundraiser on this page real?", a: "It uses the real ELF campaign page with a fictional team, roster, donors and businesses. Donations are turned off, so nothing is charged." },
];

export default function FundraisingPage() {
  return (
    <>
      <div className="mk-page-hero mk-product-hero">
        <div className="mk-container mk-product-hero-grid">
          <div>
            <span className="mk-eyebrow">ELF Fundraising</span>
            <h1 className="mk-display">
              Raise more for <span className="mk-marker-underline">the season.</span>
            </h1>
            <p>
              Personal athlete pages, a live team leaderboard and secure donations &mdash; everything
              your program needs to fund travel, gear and the moments that make a season.
            </p>
            <div className="mk-offer-actions">
              <LinkButton href="/demo" size="lg">Book a Free Demo</LinkButton>
              <a href="#preview" className="mk-text-link">Explore a sample fundraiser &rarr;</a>
            </div>
          </div>
          <figure className="mk-hero-shot">
            <div className="mk-shot">
              {/* Captured from the current PublicCampaignPage (via the
                  fictional /preview/fundraiser sample) — the real ELF
                  campaign design, not a mock-up. */}
              <Image
                src="/marketing/fundraiser-campaign-current.png"
                alt="The current ELF fundraising campaign page for the fictional Sunridge Valley Comets: team crest, $9,840 raised of a $15,000 goal, 112 donations, 18 days left, and the Support the Comets donation form"
                width={2880}
                height={1668}
                priority
                sizes="(max-width: 900px) 100vw, 560px"
              />
            </div>
            <figcaption className="mk-shot-caption">The current ELF campaign page. Sunridge Valley High School is a fictional sample team.</figcaption>
          </figure>
        </div>
      </div>

      <section className="mk-home-section" aria-labelledby="mk-fund-benefits">
        <div className="mk-container">
          <div className="mk-home-head">
            <span className="mk-eyebrow">Why ELF Fundraising</span>
            <h2 id="mk-fund-benefits" className="mk-display mk-home-title">Built to get the whole team raising.</h2>
          </div>
          <ul className="mk-benefit-grid">
            {BENEFITS.map((b) => (
              <li key={b.title} className="mk-benefit">
                <h3>{b.title}</h3>
                <p>{b.copy}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="preview" className="mk-home-section mk-home-alt mk-fp-section" aria-labelledby="mk-fund-preview">
        <div className="mk-container">
          <div className="mk-home-head">
            <span className="mk-eyebrow">Interactive preview</span>
            <h2 id="mk-fund-preview" className="mk-display mk-home-title">Explore a sample fundraiser.</h2>
            <p>
              This is the real ELF campaign page, filled with a fictional team. Switch between the team
              page and an athlete&rsquo;s page, and between phone and desktop.
            </p>
          </div>
          <FundraisingPreview gateEnabled={GATE_ENABLED} />
        </div>
      </section>

      <section className="mk-home-section" aria-labelledby="mk-fund-process">
        <div className="mk-container">
          <div className="mk-home-head">
            <span className="mk-eyebrow">How a fundraiser runs</span>
            <h2 id="mk-fund-process" className="mk-display mk-home-title">Set up. Share. Track. Report.</h2>
          </div>
          <ol className="mk-three-steps mk-four-steps">
            {PROCESS.map((s) => (
              <li key={s.num}>
                <span className="mk-three-num" aria-hidden="true">{s.num}</span>
                <h3>{s.title}</h3>
                <p>{s.copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mk-home-section mk-home-alt" aria-labelledby="mk-fund-faq">
        <div className="mk-container">
          <div className="mk-home-head">
            <span className="mk-eyebrow">FAQ</span>
            <h2 id="mk-fund-faq" className="mk-display mk-home-title">Fundraising questions.</h2>
          </div>
          <FaqList items={FAQS} />
        </div>
      </section>

      <section className="mk-section mk-cta-band">
        <div className="mk-container-narrow">
          <h2>See a fundraiser built around your sport.</h2>
          <p>No commitment. We&rsquo;ll walk through ELF using your program as the example.</p>
          <div className="mk-final-actions">
            <LinkButton href="/demo" variant="yellow" size="lg">Book a Free Demo</LinkButton>
            <LinkButton href="/product" variant="outline" size="lg" className="mk-btn-on-dark">Explore the Free Team App</LinkButton>
          </div>
        </div>
      </section>
    </>
  );
}
