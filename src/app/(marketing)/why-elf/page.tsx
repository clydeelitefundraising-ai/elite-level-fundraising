import type { Metadata } from "next";
import { LinkButton } from "@/components/marketing/Button";

export const metadata: Metadata = {
  title: "Why ELF | Elite Level Fundraising",
  description:
    "Why Elite Level Fundraising exists: one connected platform for athletic programs, built to reduce administrative chaos instead of adding another app.",
  alternates: { canonical: "/why-elf" },
  openGraph: {
    title: "Why ELF | Elite Level Fundraising",
    description: "Outcomes and philosophy, not another feature list.",
    type: "website",
  },
};

const THEMES = [
  {
    title: "One connected platform, not five disconnected tools.",
    body: "Fundraising, communication, roster, calendar, and sponsors all read and write to the same system. A donation doesn't live in a different tool than the athlete who earned it.",
  },
  {
    title: "Less administrative chaos.",
    body: "Every hour a coach spends reconciling a spreadsheet or re-explaining something already said in a group text is an hour not spent coaching. The platform exists to give that time back.",
  },
  {
    title: "Built specifically for athletics.",
    body: "Not a general charity fundraising tool with a school logo bolted on. Athlete pages, team rosters, and sponsor relationships are first-class concepts here, not workarounds.",
  },
  {
    title: "Modern communication, in one place.",
    body: "Announcements, direct messages, and push notifications live next to the fundraising campaign — the place coaches and parents are already checking.",
  },
  {
    title: "Transparent operations.",
    body: "Campaign goals, fund-use breakdowns, and progress are public by design. Parents and donors can see where things stand without asking.",
  },
  {
    title: "A privacy-conscious approach.",
    body: "We collect what's needed to run the platform and nothing more, and we say plainly what that is in the Trust Center rather than burying it in dense legal language.",
  },
  {
    title: "Direct support.",
    body: "When you email us, a person who actually knows the product answers — not a ticket queue.",
  },
  {
    title: "Arizona roots, built to grow.",
    body: "We're proudly headquartered in Phoenix and currently focused on Arizona schools, with a platform built to support athletic programs nationwide as we grow.",
  },
];

export default function WhyElfPage() {
  return (
    <>
      <div className="mk-page-hero">
        <div className="mk-container-narrow">
          <h1>Why Elite Level Fundraising exists</h1>
          <p>
            Not a longer feature list &mdash; the reasoning behind the platform, and what we&rsquo;re
            actually trying to fix for coaches and programs.
          </p>
        </div>
      </div>

      <div className="mk-section">
        <div className="mk-container-narrow">
          {THEMES.map((t) => (
            <div className="mk-manifesto-block" key={t.title}>
              <h2>{t.title}</h2>
              <p>{t.body}</p>
            </div>
          ))}
        </div>
      </div>

      <section className="mk-section mk-cta-band">
        <div className="mk-container-narrow">
          <h2>See it for yourself.</h2>
          <p>No commitment. We&rsquo;ll walk through the platform using your sport as the example.</p>
          <LinkButton href="/demo" size="lg">Book a Free Demo</LinkButton>
        </div>
      </section>
    </>
  );
}
