import type { Metadata } from "next";
import { LinkButton } from "@/components/marketing/Button";
import { FaqList } from "@/components/marketing/FaqList";

export const metadata: Metadata = {
  title: "FAQ | Elite Level Fundraising",
  description:
    "Answers to common questions about Elite Level Fundraising — fundraising, payments, coaches and teams, communication, sponsors, privacy and security, pricing, and support.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "FAQ | Elite Level Fundraising",
    description: "Fundraising, payments, teams, communication, sponsors, privacy, pricing, and support — answered honestly.",
    type: "website",
  },
};

const TOPICS = [
  {
    title: "Fundraising",
    items: [
      { q: "What is Elite Level Fundraising?", a: "A platform built for athletic programs that combines fundraising, team communication, roster and calendar management, and sponsor outreach in one place — instead of a separate tool for each." },
      { q: "Is fundraising the whole product?", a: "No. Fundraising is one part of the platform. Coaches also use it for team communication, roster management, and sponsor relationships — the goal is one system instead of several disconnected ones." },
      { q: "How does an athlete's page get set up?", a: "Athletes are added to the roster during setup or by the coach afterward, and each one gets a personal fundraising page and share link automatically — no separate signup required to be listed." },
    ],
  },
  {
    title: "Payments",
    items: [
      { q: "How are payments handled?", a: "All donations are processed through Stripe. Elite Level Fundraising does not store card details." },
      { q: "Do donors need an account to give?", a: "No. Donors give directly through the campaign or athlete page — no account required." },
      { q: "How quickly do funds reach the program?", a: "Funds are handled through Stripe's standard payout process. Exact timing depends on your Stripe account configuration — we'll walk through this during your demo." },
    ],
  },
  {
    title: "Coaches & teams",
    items: [
      { q: "How do I get started as a coach?", a: "Request a demo. We'll walk through the platform using your sport and program as the example, then set up your branded page, coach account, and team hub." },
      { q: "Can I coach more than one team?", a: "Yes. Coaches, parents, and athletes who touch more than one team switch between them from a single account." },
      { q: "What if I already have a roster spreadsheet?", a: "We import what you have during setup rather than asking you to re-enter it by hand." },
    ],
  },
  {
    title: "Parents & athletes",
    items: [
      { q: "How do parents join a team?", a: "Parents join with a code provided by the coach — no separate account creation process to manage by hand." },
      { q: "Can parents see campaign progress?", a: "Yes. Campaign progress is public on the team's page, so parents don't have to ask the coach for a status update." },
    ],
  },
  {
    title: "Communication",
    items: [
      { q: "Does this replace group texts?", a: "That's the intent — announcements, direct messages, and push notifications live in the same hub as the fundraising campaign, so there's one place to check instead of a group text plus several other apps." },
      { q: "Can announcements be targeted to specific people?", a: "Yes. Announcements can go to the whole team or be targeted — parents only, athletes only, or a specific group." },
    ],
  },
  {
    title: "Sponsors",
    items: [
      { q: "How does sponsor tracking work?", a: "Sponsors are added as records with contact info, industry, and sponsorship history, so relationships don't depend on one person's memory or inbox." },
      { q: "Can sponsors be shown on the campaign page?", a: "Yes. Active sponsors can be placed directly on the public campaign page." },
    ],
  },
  {
    title: "Privacy & security",
    items: [
      { q: "What data do you collect?", a: "For a demo request: name, school or organization, role, email, and anything written in the optional message field. Details are in the Trust Center." },
      { q: "Do you sell or share data with third parties for marketing?", a: "No. Submissions are stored in our database and are not shared with third parties for marketing purposes." },
      { q: "Where can I read your security and privacy practices?", a: "The Trust Center covers security, privacy, accessibility, and data protection in plain language." },
    ],
  },
  {
    title: "Pricing & demos",
    items: [
      { q: "What does it cost?", a: "Pricing is tailored to your program and depends on factors like roster size, which modules you use, and whether you're a single team or a full athletic department. The Pricing page has details, and a demo gets you an accurate number." },
      { q: "What happens during a demo?", a: "We walk through the platform using your sport and program as the example, and answer questions before you commit to anything. No commitment, about 20 minutes." },
      { q: "Is there a contract or minimum commitment to book a demo?", a: "No — booking a demo is simply a conversation. Any commitment happens later, and only if it's a fit." },
    ],
  },
  {
    title: "Support",
    items: [
      { q: "How do I get support after signing up?", a: "Email support@elitelevelfundraising.com. A person who knows the product answers." },
      { q: "Where is Elite Level Fundraising available?", a: "We're currently focused on Arizona schools, and the platform is built to support athletic programs nationwide as we grow." },
    ],
  },
];

export default function FaqPage() {
  return (
    <>
      <div className="mk-page-hero">
        <div className="mk-container-narrow">
          <h1>Frequently asked questions</h1>
          <p>Organized by topic. If your question isn&rsquo;t here, email us directly.</p>
        </div>
      </div>

      <div className="mk-section">
        <div className="mk-container-narrow">
          {TOPICS.map((topic) => (
            <div className="mk-faq-topic" key={topic.title}>
              <h2 className="mk-faq-topic-title">{topic.title}</h2>
              <FaqList items={topic.items} />
            </div>
          ))}
        </div>
      </div>

      <section className="mk-section mk-cta-band">
        <div className="mk-container-narrow">
          <h2>Still have a question?</h2>
          <p>Email us, or book a demo and ask us directly.</p>
          <LinkButton href="/demo" size="lg">Book a Free Demo</LinkButton>
        </div>
      </section>
    </>
  );
}
