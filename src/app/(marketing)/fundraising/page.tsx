import type { Metadata } from "next";
import { LinkButton } from "@/components/marketing/Button";
import { FaqList } from "@/components/marketing/FaqList";
import { FundraisingHero, FundraisingBenefits } from "@/components/marketing/fundraising/FundraisingTop";
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

// Step 1 is worded as a partnership on purpose: coaches can create their
// team in the app themselves, but fundraising starts switched off and is
// turned on and configured with ELF (fundraising inquiry → platform admin
// Campaign Control Center), using the coach's roster and goals.
const PROCESS = [
  { num: "01", title: "Launch Your Campaign", copy: "We work with you to get your team's branded campaign ready with your roster, fundraising goals and everything supporters need to know." },
  { num: "02", title: "Your Team Shares", copy: "Every athlete gets a personal fundraising link to share with family, friends and supporters by text, email or social media." },
  { num: "03", title: "Watch It Grow", copy: "Follow donations and team progress in real time, with a live leaderboard that keeps everyone moving toward the goal." },
  { num: "04", title: "Stay in Control", copy: "See what's been raised, track individual contributions and access reporting from your coach dashboard." },
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
      <FundraisingHero />
      <FundraisingBenefits />

      <section id="preview" className="mk-home-section mk-home-alt mk-fp-section" aria-labelledby="mk-fund-preview">
        <div className="mk-container">
          <div className="mk-home-head mk-fp-intro">
            <span className="mk-eyebrow">See ELF in action</span>
            <h2 id="mk-fund-preview" className="mk-fp-title">Your team. Your fundraiser.</h2>
            <p>
              See what fundraising with ELF looks like. Explore a sample campaign, switch between team
              and athlete pages, and experience the platform your supporters will use.
            </p>
          </div>
          <FundraisingPreview gateEnabled={GATE_ENABLED} />
        </div>
      </section>

      <section className="mk-home-section mk-timeline-section" aria-labelledby="mk-fund-process">
        <div className="mk-container">
          <div className="mk-home-head">
            <span className="mk-eyebrow">How ELF fundraising works</span>
            <h2 id="mk-fund-process" className="mk-display mk-home-title">We make fundraising simple.</h2>
            <p>
              From launching your campaign to tracking every donation, ELF gives your program a
              straightforward way to raise more with less work.
            </p>
          </div>
          <ol className="mk-timeline">
            {PROCESS.map((s) => (
              <li key={s.num} className="mk-timeline-step">
                <span className="mk-timeline-num" aria-hidden="true">{s.num}</span>
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
