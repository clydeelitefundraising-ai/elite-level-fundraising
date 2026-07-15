import type { Metadata } from "next";
import { LinkButton } from "@/components/marketing/Button";

export const metadata: Metadata = {
  title: "Pricing | Elite Level Fundraising",
  description:
    "Elite Level Fundraising pricing is tailored to your program. Here's what influences it, how the demo and onboarding process works, and answers to common pricing questions.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing | Elite Level Fundraising",
    description: "Pricing tailored to your program — what influences it, and how to get a straight answer.",
    type: "website",
  },
};

const FACTORS = [
  "The size of your roster and program",
  "Which modules you use — fundraising, communication, sponsors, or all three",
  "Whether you're a single team or an athletic department with multiple teams",
  "Your season length and campaign timing",
];

const CONCERNS = [
  {
    q: "Why isn't there a price on this page?",
    a: "Because publishing a number that doesn't actually fit most programs isn't honest pricing — it's a placeholder. We'd rather give you an accurate answer in a short conversation than a generic figure you'd have to double-check anyway.",
  },
  {
    q: "Is this going to be a sales pitch?",
    a: "The demo is a walkthrough of the platform using your sport and program as the example, followed by a straight answer on cost. If it's not a fit, we'll say so.",
  },
  {
    q: "What happens after the demo?",
    a: "If you want to move forward, we set up your branded page, add your coach account, and configure your team hub — most programs are ready to share their page shortly after.",
  },
  {
    q: "Are there hidden fees?",
    a: "We're not going to publish a number here we can't stand behind, and we won't publish a fee schedule we haven't finalized either — ask directly during the demo and we'll give you a straight answer.",
  },
];

export default function PricingPage() {
  return (
    <>
      <div className="mk-page-hero">
        <div className="mk-container-narrow">
          <h1>Pricing tailored to your program</h1>
          <p>
            We don&rsquo;t have a published price list yet, and we&rsquo;d rather tell you that
            plainly than publish numbers that don&rsquo;t hold up. Here&rsquo;s what actually
            drives the cost, and how to get a real answer.
          </p>
        </div>
      </div>

      <div className="mk-section">
        <div className="mk-container-narrow">
          <h2 style={{ fontSize: "var(--mk-text-2xl)", marginBottom: "var(--mk-space-4)" }}>
            What influences pricing
          </h2>
          <ul className="mk-capability-list">
            {FACTORS.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mk-section mk-section-alt">
        <div className="mk-container-narrow">
          <h2 style={{ fontSize: "var(--mk-text-2xl)", marginBottom: "var(--mk-space-4)" }}>
            How to get an answer
          </h2>
          <p style={{ color: "var(--mk-muted)", marginBottom: "var(--mk-space-4)" }}>
            The fastest path to an accurate number is a short demo. We&rsquo;ll look at your
            program, ask what you actually need, and give you a straight answer &mdash; not a
            quote that assumes the largest possible use case.
          </p>
        </div>
      </div>

      <div className="mk-section">
        <div className="mk-container-narrow">
          <h2 style={{ fontSize: "var(--mk-text-2xl)", marginBottom: "var(--mk-space-6)" }}>
            Common questions
          </h2>
          {CONCERNS.map((c) => (
            <div className="mk-concern" key={c.q}>
              <h3>{c.q}</h3>
              <p>{c.a}</p>
            </div>
          ))}
        </div>
      </div>

      <section className="mk-section mk-cta-band">
        <div className="mk-container-narrow">
          <h2>Get a straight answer on pricing.</h2>
          <p>No commitment. 20 minutes, built around your program.</p>
          <LinkButton href="/demo" size="lg">Book a Free Demo</LinkButton>
        </div>
      </section>
    </>
  );
}
