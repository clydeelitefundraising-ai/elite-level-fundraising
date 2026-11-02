import type { Metadata } from "next";
import Image from "next/image";
import { LinkButton } from "@/components/marketing/Button";
import { PartnerInquiryForm } from "@/components/marketing/PartnerInquiryForm";

// /sponsors — ELF Community Partners, written for local business owners.
// Follows the approved /fundraising, /product and /how-it-works direction
// (Inter 700 sentence-case headings, .mk-fhero hero, numbered .mk-fbenefit
// items, 12px buttons, warm white/cream backgrounds); page-only styles are
// the .mk-spn-* rules in the redesign stylesheet.
//
// Accuracy — every claim is what the product does today:
//  • Community Partners are arranged with ELF and appear, as a card with the
//    business's logo, name and website link, in the Team App's Partners
//    area, in a Community Partners section on the team's Home screen, and on
//    the team's public fundraising page. Each depends on the school's
//    settings (in-app and public placements are separate switches), and
//    positions rotate across participating schools (no school, team or
//    area targeting), so nothing promises a placement — ELF confirms the
//    placements a partnership includes. A sponsor may share a community
//    preference, which never guarantees placement.
//  • No prices, reach, impressions, results or guarantees. Until the
//    cancellation agreement is final: "No long-term commitment" only — no
//    cancellation or refund mechanics.
//  • Community Partners are distinct from the sponsors a team manages
//    itself (the Team Sponsors list).
//
// The two pictures are real captures of the fictional Sunridge Valley
// Comets sample (the Team App demo's Partners screen and the sample public
// fundraising page — the app's own components); every business shown is a
// fictional sample with an invented logo (scripts/marketing/sample-assets.mjs).

export const metadata: Metadata = {
  title: "Community Partners | Elite Level Fundraising",
  description:
    "Become an ELF Community Partner: put your business in front of local sports families in the ELF Team App and on team fundraising pages. Affordable monthly partnerships — contact us for options.",
  alternates: { canonical: "/sponsors" },
  openGraph: {
    title: "ELF Community Partners | Elite Level Fundraising",
    description: "Your next customers are cheering from the sidelines. Ask about monthly Community Partner options.",
    type: "website",
  },
};

const BENEFITS = [
  { title: "Reach local families.", copy: "Put your business where coaches, parents and athletes connect throughout the season." },
  { title: "Stay part of the conversation.", copy: "Keep your brand visible through ongoing team activity, not just a one-day event or a single advertisement." },
  { title: "Support something that matters.", copy: "Help ELF make youth sports fundraising more accessible and keep more resources going toward the programs that need them." },
];

const PLACEMENTS = [
  { title: "In the Team App", copy: "The Partners area of the app, where ELF Community Partners are listed for the team’s coaches, athletes and parents." },
  { title: "On the team’s Home screen", copy: "A Community Partners section on the Team App Home screen. Featured placement may also be available." },
  { title: "On public fundraising pages", copy: "The Community Partners section of a team’s public fundraising page, while the team is fundraising." },
];

const OFFER = [
  "Monthly partnership options.",
  "No long-term commitment.",
  "Clear placement details before you begin.",
];

export default function SponsorsPage() {
  return (
    <>
      <section className="mk-fhero mk-spn-hero" aria-labelledby="mk-spn-title">
        <div className="mk-container mk-fhero-grid">
          <div className="mk-fhero-copy">
            <span className="mk-eyebrow">ELF Community Partners</span>
            <h1 id="mk-spn-title" className="mk-fhero-title">
              Your next customers are cheering from the sidelines.
            </h1>
            <span className="mk-fhero-rule" aria-hidden="true" />
            <p>
              Put your business in front of local sports families through the ELF Team App and team
              fundraising pages. Build recognition in your community while helping youth programs thrive.
            </p>
            <p className="mk-spn-terms">Flexible monthly partnerships. No long-term commitment.</p>
            <div className="mk-fhero-actions">
              <LinkButton href="#inquire" size="lg">Become a Community Partner</LinkButton>
              <a href="#placements" className="mk-fhero-link">See where your business appears <span aria-hidden="true">&rarr;</span></a>
            </div>
          </div>

          <figure className="mk-spn-visual">
            <div className="mk-spn-stage">
              <div className="mk-fhero-frame mk-spn-public">
                <Image
                  src="/marketing/partners-fundraising-section.png"
                  alt="The ELF Community Partners section of the fictional Sunridge Valley Comets public fundraising page: cards with the logo and name of each local business"
                  width={1196}
                  height={1368}
                  priority
                  sizes="(max-width: 900px) 70vw, 34vw"
                />
              </div>
              <div className="mk-phone-frame mk-spn-phone">
                <Image
                  src="/marketing/partners-team-app.png"
                  alt="The ELF Community Partners screen in the ELF Team App for the same team, listing the same local businesses"
                  width={780}
                  height={1688}
                  priority
                  sizes="(max-width: 900px) 40vw, 15vw"
                />
              </div>
            </div>
            <figcaption className="mk-fhero-caption">
              The Team App and a public fundraising page. Sample team; every business shown is fictional.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="mk-fbenefits mk-spn-benefits" aria-labelledby="mk-spn-why">
        <div className="mk-container">
          <div className="mk-fbenefits-head">
            <span className="mk-eyebrow">Why partner with ELF</span>
            <h2 id="mk-spn-why" className="mk-fbenefits-title mk-spn-title">Good for your business. Great for your community.</h2>
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

      <section id="placements" className="mk-spn-proof" aria-labelledby="mk-spn-proof-title">
        <div className="mk-container">
          <div className="mk-spn-head">
            <span className="mk-eyebrow">See your business in ELF</span>
            <h2 id="mk-spn-proof-title" className="mk-va-title mk-spn-title">Real placement. Real community visibility.</h2>
          </div>

          <div className="mk-spn-shots">
            <figure className="mk-spn-shot-wide">
              <div className="mk-fhero-frame">
                <Image
                  src="/marketing/partners-fundraising-page.png"
                  alt="A public ELF fundraising page for the fictional Sunridge Valley Comets: recent support on the left and the ELF Community Partners grid of local business logos on the right"
                  width={2560}
                  height={1630}
                  sizes="(max-width: 900px) 92vw, 62vw"
                />
              </div>
              <figcaption className="mk-fhero-caption">On a team&rsquo;s public fundraising page.</figcaption>
            </figure>
            <figure className="mk-spn-shot-phone">
              <div className="mk-phone-frame">
                <Image
                  src="/marketing/partners-team-app.png"
                  alt="ELF Community Partners in the ELF Team App: a grid of local business cards above the app's bottom navigation"
                  width={780}
                  height={1688}
                  sizes="(max-width: 900px) 60vw, 260px"
                />
              </div>
              <figcaption className="mk-fhero-caption">In the ELF Team App.</figcaption>
            </figure>
          </div>

          <ol className="mk-spn-placements">
            {PLACEMENTS.map((p) => (
              <li key={p.title}>
                <h3>{p.title}</h3>
                <p>{p.copy}</p>
              </li>
            ))}
          </ol>

          <div className="mk-spn-notes">
            <p>
              Each partner card shows your logo and business name and links to your website. ELF
              Community Partners rotate across participating schools &mdash; placement isn&rsquo;t tied to
              a particular school, team or area. Where your business appears depends on your partnership
              option and each school&rsquo;s settings, and we confirm the placements included in your
              partnership before it begins.
            </p>
            <p>
              ELF Community Partners are arranged with ELF and are separate from the sponsors a team
              manages itself, which teams list under Team Sponsors.
            </p>
            <p className="mk-spn-disclosure">
              Sunridge Valley High School and every business shown on this page are fictional samples.
            </p>
          </div>
        </div>
      </section>

      <section className="mk-spn-offer" aria-labelledby="mk-spn-offer-title">
        <div className="mk-container mk-spn-offer-grid">
          <div>
            <span className="mk-eyebrow">Monthly partnerships</span>
            <h2 id="mk-spn-offer-title" className="mk-va-title mk-spn-title">Local advertising that fits your business.</h2>
            <p>
              Choose an affordable monthly partnership that fits your goals. We&rsquo;ll walk you through
              available partnership options and where your business can appear.
            </p>
            <LinkButton href="#inquire" size="lg">Ask About Monthly Options</LinkButton>
          </div>
          <ul className="mk-spn-offer-list">
            {OFFER.map((o) => <li key={o}>{o}</li>)}
          </ul>
        </div>
      </section>

      <section id="inquire" className="mk-spn-inquire" aria-labelledby="mk-spn-inquire-title">
        <div className="mk-container mk-spn-inquire-grid">
          <div>
            <span className="mk-eyebrow">Become a Community Partner</span>
            <h2 id="mk-spn-inquire-title" className="mk-va-title mk-spn-title">Let&rsquo;s put your business on the team.</h2>
            <p>
              Tell us a little about your business. We&rsquo;ll help you explore available monthly
              partnerships and where your business can appear.
            </p>
            <p className="mk-spn-alt">
              You can share a preferred community or area. Preferences help us plan, but they don&rsquo;t
              guarantee placement in a specific area or at a specific school.
            </p>
            <p className="mk-spn-alt">
              Prefer email? Write to <a href="mailto:info@elitelevelfundraising.com">info@elitelevelfundraising.com</a>.
            </p>
          </div>
          <div className="mk-form-card">
            <PartnerInquiryForm />
          </div>
        </div>
        <p className="mk-spn-closing">Your business grows with the community. Let&rsquo;s support both.</p>
      </section>
    </>
  );
}
