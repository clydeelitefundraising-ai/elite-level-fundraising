import type { Metadata } from "next";
import { LinkButton } from "@/components/marketing/Button";
import { ProductPreview } from "@/components/marketing/ProductPreview";

export const metadata: Metadata = {
  title: "Sponsors | Elite Level Fundraising",
  description:
    "How Elite Level Fundraising organizes local-business sponsorships — sponsor records, relationship tracking, and reporting, built alongside fundraising instead of separate from it.",
  alternates: { canonical: "/sponsors" },
  openGraph: {
    title: "Sponsors | Elite Level Fundraising",
    description: "Sponsor records, relationship tracking, and visibility — organized in one place instead of one person's inbox.",
    type: "website",
  },
};

const STAGES = [
  {
    num: "01",
    title: "Add a sponsor",
    copy: "A local business becomes a sponsor record — contact info, industry, and how they support the program — instead of a name in someone's phone.",
  },
  {
    num: "02",
    title: "Track the relationship",
    copy: "Every conversation, renewal date, and sponsorship history is logged against that record, so the relationship survives a coaching change or a busy season.",
  },
  {
    num: "03",
    title: "Report on it",
    copy: "Sponsor status rolls up into reporting for coaches and ADs, and active sponsors can be placed directly on the public campaign page.",
  },
];

export default function SponsorsPage() {
  return (
    <>
      <div className="mk-page-hero">
        <div className="mk-container-narrow">
          <h1>Sponsor relationships that don&rsquo;t rely on memory</h1>
          <p>
            Local businesses support athletic programs constantly &mdash; most of that goodwill
            gets lost the moment the person who managed it moves on. ELF keeps it as a record, not
            a memory.
          </p>
        </div>
      </div>

      <div className="mk-section">
        <div className="mk-container">
          <div className="mk-steps" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {STAGES.map((s) => (
              <div className="mk-step" key={s.num}>
                <span className="mk-step-num">{s.num}</span>
                <h3>{s.title}</h3>
                <p>{s.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="mk-section mk-section-alt mk-capability">
        <div className="mk-container mk-capability-grid">
          <div className="mk-capability-copy">
            <span className="mk-eyebrow">Sponsor directory</span>
            <h2 style={{ fontSize: "var(--mk-text-2xl)" }}>Status, at a glance.</h2>
            <p style={{ color: "var(--mk-muted)", marginTop: "var(--mk-space-3)" }}>
              Active sponsors, renewals coming due, and prospects still in conversation &mdash; one
              directory instead of scattered notes.
            </p>
            <ul className="mk-capability-list">
              <li>Sponsor records with contact info and history</li>
              <li>Renewal tracking, so relationships don&rsquo;t lapse quietly</li>
              <li>Visibility for coaches, ADs, and booster leadership</li>
            </ul>
          </div>
          <ProductPreview label="Sponsor Directory">
            <div className="mk-pipeline">
              <div className="mk-pipeline-row">
                <span className="mk-pipeline-name">Local restaurant</span>
                <span className="mk-pipeline-status mk-pipeline-status-active">Active</span>
              </div>
              <div className="mk-pipeline-row">
                <span className="mk-pipeline-name">Auto dealership</span>
                <span className="mk-pipeline-status mk-pipeline-status-renewal">Renewal due</span>
              </div>
              <div className="mk-pipeline-row">
                <span className="mk-pipeline-name">Family dentistry</span>
                <span className="mk-pipeline-status mk-pipeline-status-prospect">Prospect</span>
              </div>
            </div>
          </ProductPreview>
        </div>
      </section>

      <div className="mk-section">
        <div className="mk-container">
          <div className="mk-differentiator">
            <h2>Sponsors aren&rsquo;t bolted onto fundraising &mdash; they&rsquo;re built alongside it.</h2>
            <p>
              Most fundraising tools treat sponsors as an afterthought, if they support them at
              all. ELF was built with sponsor tracking as one of its core modules from the start,
              because for a lot of programs, sponsor relationships are as important as individual
              donations &mdash; and they deserve the same level of organization.
            </p>
          </div>
        </div>
      </div>

      <section className="mk-section mk-cta-band">
        <div className="mk-container-narrow">
          <h2>See how sponsor tracking fits your program.</h2>
          <p>No commitment. We&rsquo;ll walk through the platform using your sport as the example.</p>
          <LinkButton href="/demo" size="lg">Book a Free Demo</LinkButton>
        </div>
      </section>
    </>
  );
}
