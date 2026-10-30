import Image from "next/image";
import { LinkButton } from "@/components/marketing/Button";

// The approved /fundraising hero and "Built for the whole team" benefits
// (approved "Minimal Fundraising Website" mockup), shared by the page and
// the temporary typography comparison route so both render identical
// markup. `idSuffix` keeps element ids unique when the sections appear more
// than once on a page; /fundraising itself uses the default ids.

export const BENEFITS = [
  { title: "Every athlete has a role.", copy: "Give each athlete a personal fundraising page and shareable link, making it easy to reach family, friends, and supporters." },
  { title: "Every dollar moves you forward.", copy: "Follow your team's progress in real time with live totals and an athlete leaderboard that keeps everyone engaged." },
  { title: "Giving made simple.", copy: "Supporters can donate securely in just a few steps—no account required. Payments are powered by Stripe." },
  { title: "Show what you're building.", copy: "Share exactly what your team is raising money for, from travel and equipment to opportunities beyond the field." },
  { title: "Less admin. More coaching.", copy: "Track contributions, monitor athlete progress, and manage your fundraiser from one organized dashboard." },
  { title: "Backed by your community.", copy: "Give local businesses visibility alongside the programs they support through ELF Community Partnerships." },
];

export function FundraisingHero({ idSuffix = "", headingLevel = 1 }: { idSuffix?: string; headingLevel?: 1 | 2 }) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const titleId = `mk-fhero-title${idSuffix}`;
  return (
    <section className="mk-fhero" aria-labelledby={titleId}>
      <div className="mk-container mk-fhero-grid">
        <div className="mk-fhero-copy">
          <span className="mk-eyebrow">ELF Fundraising</span>
          <Heading id={titleId} className="mk-display mk-fhero-title">
            Raise more<br /> for the season.
          </Heading>
          <span className="mk-fhero-rule" aria-hidden="true" />
          <p>
            Give every athlete a role in your team&rsquo;s success. ELF brings personal fundraising
            pages, live progress tracking, and secure online donations together&mdash;making it
            easier to raise the resources your program needs.
          </p>
          <div className="mk-fhero-actions">
            <LinkButton href="/demo" size="lg">Book a Free Demo</LinkButton>
            <a href="#preview" className="mk-fhero-link">Explore a Sample Fundraiser <span aria-hidden="true">&rarr;</span></a>
          </div>
        </div>
        <figure className="mk-fhero-shot">
          <div className="mk-fhero-frame">
            {/* Captured from the current PublicCampaignPage (via the
                fictional /preview/fundraiser sample) — the real ELF
                campaign design, not a mock-up. */}
            <Image
              src="/marketing/fundraiser-campaign-current.png"
              alt="The current ELF fundraising campaign page for the fictional Sunridge Valley Comets: team crest, $9,840 raised of a $15,000 goal, 112 donations, 18 days left, and the Support the Comets donation form"
              width={2880}
              height={1668}
              priority
              sizes="(max-width: 900px) 100vw, 640px"
            />
          </div>
          <figcaption className="mk-fhero-caption">The current ELF campaign page. Sunridge Valley High School is a fictional sample team.</figcaption>
        </figure>
      </div>
    </section>
  );
}

export function FundraisingBenefits({ idSuffix = "" }: { idSuffix?: string }) {
  const titleId = `mk-fund-benefits${idSuffix}`;
  return (
    <section className="mk-fbenefits" aria-labelledby={titleId}>
      <div className="mk-container">
        <div className="mk-fbenefits-head">
          <span className="mk-eyebrow">Why ELF Fundraising</span>
          <h2 id={titleId} className="mk-display mk-fbenefits-title">Built for the whole team.</h2>
          <p>Simple for coaches. Easy for athletes. Seamless for supporters.</p>
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
  );
}
