import type { Metadata } from "next";
import { LinkButton } from "@/components/marketing/Button";
import { PartnerInquiryForm } from "@/components/marketing/PartnerInquiryForm";
import CommunityPartnerSlots from "@/components/communityPartners/CommunityPartnerSlots";
import { SAMPLE_PARTNERS } from "@/components/marketing/demo/fixtures";

// Community Partners — written for local businesses. Every claim here is
// what the product actually does: partners show as a card (logo, business
// name, link to their website) in the Community Partners grid on a team's
// Team App Home screen, in the team's Partners area, and on the team's
// public fundraising page. No prices are published (inquiry only), and
// nothing promises reach, impressions, exclusivity or guaranteed placement.
// The example grid is the real component with fictional businesses.

export const metadata: Metadata = {
  title: "Community Partners | Elite Level Fundraising",
  description:
    "Local businesses can become ELF Community Partners and appear in the Team App and on public fundraising pages for the school teams they support. Contact us about monthly partnership options.",
  alternates: { canonical: "/sponsors" },
  openGraph: {
    title: "ELF Community Partners | Elite Level Fundraising",
    description: "Put your business in front of the families who show up every week. Contact us about monthly partnership options.",
    type: "website",
  },
};

const VALUE = [
  { title: "Be part of the season", copy: "Your business is shown alongside the teams you support — where coaches, athletes and families check in throughout the season." },
  { title: "Your brand, your link", copy: "Each partner card shows your logo and business name, and links straight to your website." },
  { title: "Back local athletes", copy: "Show the families in your community that your business supports the teams their kids play on." },
  { title: "Simple to get started", copy: "Send us your logo and website. We handle the setup and confirm exactly where you'll appear." },
];

const PLACEMENTS = [
  {
    title: "Team App Home",
    copy: "The Community Partners grid on the team's Home screen in the ELF Team App.",
  },
  {
    title: "Partners section",
    copy: "The team's Partners area in the app, listing its Community Partners together.",
  },
  {
    title: "Public fundraising pages",
    copy: "The Community Partners section of the team's public fundraising page, when the team runs a fundraiser.",
  },
];

const STEPS = [
  { num: "1", title: "Contact ELF", copy: "Send the form below. Tell us about your business and the school or teams you'd like to support." },
  { num: "2", title: "Talk through options", copy: "We'll go over monthly partnership options and which participating teams are available." },
  { num: "3", title: "Send your branding", copy: "Share your logo, business name and website so we can set up your partner card." },
  { num: "4", title: "Go live", copy: "Your approved partnership begins, and we confirm where your business appears." },
];

export default function SponsorsPage() {
  return (
    <>
      <div className="mk-page-hero mk-product-hero">
        <div className="mk-container mk-product-hero-grid">
          <div>
            <span className="mk-eyebrow">ELF Community Partners</span>
            <h1 className="mk-display">
              Put your business in front of the families who <span className="mk-marker-underline">show up</span> every week.
            </h1>
            <p>
              Become an ELF Community Partner and support local school teams &mdash; with your business
              shown in the ELF Team App and on the public fundraising pages of the teams you support.
            </p>
            <div className="mk-offer-actions">
              <LinkButton href="#inquire" size="lg">Contact Us About Partnering</LinkButton>
              <a href="#placements" className="mk-text-link">See where partners appear &rarr;</a>
            </div>
          </div>
          <div className="mk-partner-hero-card" aria-hidden="true">
            <span className="mk-partner-hero-label">Community Partners</span>
            <div className="mk-partner-hero-tiles">
              {SAMPLE_PARTNERS.slice(0, 6).map((p) => (
                <span key={p.id} className="mk-partner-hero-tile">
                  <span className="mk-partner-hero-initial">{p.business_name[0]}</span>
                  {p.business_name}
                </span>
              ))}
            </div>
            <span className="mk-partner-hero-note">Sample businesses</span>
          </div>
        </div>
      </div>

      <section className="mk-home-section" aria-labelledby="mk-partner-value">
        <div className="mk-container">
          <div className="mk-home-head">
            <span className="mk-eyebrow">Why partner with ELF</span>
            <h2 id="mk-partner-value" className="mk-display mk-home-title">Local business. Local teams.</h2>
          </div>
          <ul className="mk-benefit-grid mk-benefit-grid-4">
            {VALUE.map((v) => (
              <li key={v.title} className="mk-benefit">
                <h3>{v.title}</h3>
                <p>{v.copy}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="placements" className="mk-home-section mk-home-alt" aria-labelledby="mk-partner-placements">
        <div className="mk-container">
          <div className="mk-home-head">
            <span className="mk-eyebrow">Where partners appear</span>
            <h2 id="mk-partner-placements" className="mk-display mk-home-title">Seen where the team gathers.</h2>
            <p>
              Your partner card shows your logo, business name and a link to your website. Placements
              depend on the teams you support and each school&rsquo;s settings &mdash; we confirm exactly
              where you&rsquo;ll appear before your partnership begins.
            </p>
          </div>
          <ol className="mk-placement-list">
            {PLACEMENTS.map((p, i) => (
              <li key={p.title}>
                <span className="mk-three-num" aria-hidden="true">{i + 1}</span>
                <div>
                  <h3>{p.title}</h3>
                  <p>{p.copy}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mk-partner-examples">
            <figure className="mk-partner-example">
              <div className="mk-phone-frame mk-phone-frame-ui">
                <div className="mk-partner-phone-head">
                  <span>Sunridge Valley Comets</span>
                  <strong>Community Partners</strong>
                </div>
                <div className="mk-partner-phone-body">
                  <CommunityPartnerSlots partners={SAMPLE_PARTNERS} variant="app" />
                </div>
              </div>
              <figcaption className="mk-shot-caption">In the Team App &mdash; sample team, fictional businesses.</figcaption>
            </figure>
            <figure className="mk-partner-example mk-partner-example-wide">
              <div className="mk-browser-frame">
                <div className="mk-browser-bar" aria-hidden="true"><span /><span /><span /></div>
                <div className="mk-partner-browser-body">
                  <h3>Our Community Partners</h3>
                  <p>Thank you to the local businesses supporting the Sunridge Valley Comets this season.</p>
                  <CommunityPartnerSlots partners={SAMPLE_PARTNERS} variant="public" />
                </div>
              </div>
              <figcaption className="mk-shot-caption">On a public fundraising page &mdash; blank cards are open positions.</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="mk-home-section" aria-labelledby="mk-partner-steps">
        <div className="mk-container">
          <div className="mk-home-head">
            <span className="mk-eyebrow">How it works</span>
            <h2 id="mk-partner-steps" className="mk-display mk-home-title">Getting started is simple.</h2>
          </div>
          <ol className="mk-three-steps mk-four-steps">
            {STEPS.map((s) => (
              <li key={s.num}>
                <span className="mk-three-num" aria-hidden="true">{s.num}</span>
                <h3>{s.title}</h3>
                <p>{s.copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="inquire" className="mk-home-section mk-home-alt mk-inquire" aria-labelledby="mk-partner-inquire">
        <div className="mk-container mk-inquire-grid">
          <div>
            <span className="mk-eyebrow">Monthly partnership options</span>
            <h2 id="mk-partner-inquire" className="mk-home-title-sm">Contact us for monthly partnership options.</h2>
            <p>
              Partnerships are arranged directly with ELF. Tell us about your business and the teams
              you&rsquo;d like to support, and we&rsquo;ll reach out to walk through the options that fit.
            </p>
            <p className="mk-inquire-alt">
              Prefer email? Write to <a href="mailto:info@elitelevelfundraising.com">info@elitelevelfundraising.com</a>.
            </p>
          </div>
          <div className="mk-form-card">
            <PartnerInquiryForm />
          </div>
        </div>
      </section>

      <section className="mk-home-section" aria-labelledby="mk-partner-schools">
        <div className="mk-container mk-schools-note">
          <div>
            <span className="mk-eyebrow">For schools and programs</span>
            <h2 id="mk-partner-schools" className="mk-home-title-sm">Your own sponsors, organized too.</h2>
          </div>
          <div>
            <p>
              Programs keep their own sponsor relationships in ELF as records &mdash; contact info,
              conversations, renewal dates and sponsorship history &mdash; so goodwill survives a coaching
              change or a busy season, and coaches, ADs and booster leaders can see where things stand.
            </p>
            <ul className="mk-check-list">
              <li>Sponsor records with contact info and history</li>
              <li>Renewal tracking, so relationships don&rsquo;t lapse quietly</li>
              <li>Visibility for coaches, ADs and booster leadership</li>
            </ul>
            <div className="mk-offer-actions">
              <LinkButton href="/demo" variant="dark">Book a Demo for Your Program</LinkButton>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
