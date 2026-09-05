import Image from "next/image";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { LinkButton } from "@/components/marketing/Button";
import { ProductPreview } from "@/components/marketing/ProductPreview";
import { FaqList } from "@/components/marketing/FaqList";
import { MediaPlaceholder } from "@/components/marketing/MediaPlaceholder";

// Anchors here must match the section ids below exactly — one card per
// section, no duplicates.
const MODULES = [
  { href: "/fundraising", title: "Fundraising" },
  { href: "/communication", title: "Communication" },
  { href: "/sponsors", title: "Sponsors & Reporting" },
];

// Real, checked-in school/partner logos only — see Phase 3 report for a
// flagged third asset (public/univeristy-logo.png) deliberately excluded
// here because it's generic stock crest art, not a real ELF partner.
const TRUST_LOGOS = [
  { src: "/Glendale-logo.png", alt: "Glendale Cardinals", width: 390, height: 129 },
  { src: "/pvcc-logo.png", alt: "Paradise Valley Community College", width: 1569, height: 340 },
];

const TRUST_FACTS = [
  { label: "Secure payments", detail: "Stripe-secured, no card details stored" },
  { label: "Built in Arizona", detail: "Phoenix HQ, built for schools first" },
  { label: "Built with coaches", detail: "Shaped by direct coach feedback" },
  { label: "Real Trust Center", detail: "Security & privacy docs, public" },
  { label: "Direct support", detail: "A person who knows the product answers" },
];

const FUND_ITEMS = [
  { label: "Travel", num: "01" },
  { label: "Uniforms", num: "02" },
  { label: "Hotels", num: "03" },
  { label: "Tournaments & meets", num: "04" },
  { label: "Equipment", num: "05" },
  { label: "Team experiences", num: "06" },
];

const FAQS = [
  {
    q: "What is Elite Level Fundraising?",
    a: "A platform built for athletic programs that combines fundraising, team communication, roster and calendar management, and sponsor outreach in one place — instead of a separate tool for each.",
  },
  {
    q: "Is fundraising the whole product?",
    a: "No. Fundraising is one part of the platform. Coaches also use it for team communication, roster management, and sponsor relationships — the goal is one system instead of several disconnected ones.",
  },
  {
    q: "Where is Elite Level Fundraising available?",
    a: "We're currently focused on Arizona schools, and the platform is built to support athletic programs nationwide as we grow.",
  },
  {
    q: "How are payments handled?",
    a: "All donations are processed through Stripe. Elite Level Fundraising does not store card details.",
  },
  {
    q: "What does it cost?",
    a: "Pricing is tailored to your program and is still evolving as we grow. The best way to get an accurate answer is a short demo.",
  },
  {
    q: "How do I get started?",
    a: "Request a demo below. We'll walk through the platform using your sport and program as the example, and answer questions before you commit to anything.",
  },
];

export default function MarketingPage() {
  return (
    <MarketingShell>
      {/* ── HERO ── */}
      <section className="mk-hero">
        <div className="mk-container mk-hero-grid">
          <div>
            <span className="mk-hero-tag">Proudly serving Arizona schools</span>
            <h1>
              Fund<br />
              the<br />
              <span className="mk-marker-underline">season.</span>
            </h1>
            <p className="mk-hero-sub">
              ELF helps teams raise money, build stronger programs, and keep everyone connected &mdash;
              in one place instead of five.
            </p>
            <span className="mk-hand mk-hero-hand">Same team. Bigger opportunities.</span>
            <div className="mk-hero-actions">
              <LinkButton href="/demo" size="lg">Get Started</LinkButton>
              <LinkButton href="/product" variant="outline" size="lg">See ELF in Action</LinkButton>
            </div>
            <p className="mk-hero-note">No commitment. 20 minutes. Built around your program.</p>
          </div>

          <div className="mk-hero-visual">
            <MediaPlaceholder
              label="Team huddle or sideline moment — real athletes, documentary style, not posed"
              aspect="4 / 5"
            />
          </div>
        </div>
      </section>

      {/* ── TRUST STRIP ── */}
      <section className="mk-trust-band">
        <div className="mk-container">
          <p className="mk-trust-eyebrow">Trusted by programs across Arizona and beyond</p>
          <div className="mk-trust-logos">
            {TRUST_LOGOS.map((logo) => (
              <span className="mk-trust-logo-chip" key={logo.src}>
                <Image src={logo.src} alt={logo.alt} width={logo.width} height={logo.height} style={{ height: "100%", width: "auto" }} />
              </span>
            ))}
          </div>
          <div className="mk-trust-grid">
            {TRUST_FACTS.map((f) => (
              <span className="mk-trust-item" key={f.label}>
                <strong>{f.label}.</strong> {f.detail}.
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── VALUE (RAISE MORE. DO MORE.) ── */}
      <section className="mk-section mk-section-alt" id="platform">
        <div className="mk-container mk-value-grid">
          <div>
            <span className="mk-eyebrow">One platform</span>
            <h2 className="mk-display" style={{ fontSize: "var(--mk-text-4xl)", marginBottom: "var(--mk-space-5)" }}>
              Raise more.<br />Do more.
            </h2>
            <p style={{ color: "var(--mk-muted)", fontSize: "var(--mk-text-lg)", maxWidth: "44ch" }}>
              Running a program shouldn&rsquo;t mean juggling five different apps. ELF makes it easy for
              high school teams to raise money, manage their program, and keep everyone connected &mdash; all
              in one place.
            </p>
            <div className="mk-value-links">
              {MODULES.map((m) => (
                <a href={m.href} key={m.title}>{m.title} &rarr;</a>
              ))}
            </div>
          </div>
          <div className="mk-value-visual">
            <ProductPreview
              label="Live campaign page"
              image={{ src: "/marketing/campaign-hero.png", alt: "A real Elite Level Fundraising campaign page for a demo football program, showing the goal, days left, and donor count", width: 1440, height: 620 }}
              demoNote="Demo data — Riverside High School is a sample program, not a real customer."
            />
            <span className="mk-value-tag mk-display">Built for teams</span>
          </div>
        </div>
      </section>

      {/* ── WHAT ARE WE FUNDING ── */}
      <section className="mk-section mk-fund-section">
        <div className="mk-container mk-fund-grid">
          <div>
            <span className="mk-eyebrow">More than fundraising</span>
            <h2 className="mk-display" style={{ fontSize: "var(--mk-text-4xl)" }}>What are we funding?</h2>
            <ul className="mk-fund-list">
              {FUND_ITEMS.map((f) => (
                <li key={f.label}><span>{f.num}</span>{f.label}</li>
              ))}
            </ul>
          </div>
          <MediaPlaceholder label="Team travel or tournament experience — real trip, real team" aspect="3 / 4" />
        </div>
      </section>

      {/* ── FUNDRAISING ── */}
      <section className="mk-section mk-capability" id="fundraising">
        <div className="mk-container mk-capability-grid">
          <div className="mk-capability-copy">
            <span className="mk-eyebrow">Fundraising</span>
            <h2 style={{ fontSize: "var(--mk-text-2xl)" }}>Give every athlete a reason to share.</h2>
            <p style={{ color: "var(--mk-muted)", marginTop: "var(--mk-space-3)" }}>
              Each athlete gets a personal fundraising page and a spot on a live leaderboard, so donations feel like team momentum, not a cold ask.
            </p>
            <ul className="mk-capability-list">
              <li>Personal athlete share links and live leaderboards</li>
              <li>Real-time campaign tracking for coaches and ADs</li>
              <li>Stripe-powered payments with clear, transparent fees</li>
            </ul>
          </div>
          <ProductPreview
            label="Athlete leaderboard"
            image={{ src: "/marketing/leaderboard.png", alt: "Real athlete leaderboard and donation form from a demo Elite Level Fundraising campaign page, ranked by amount raised", width: 1002, height: 660 }}
            demoNote="Demo data — Riverside High School is a sample program, not a real customer."
          />
        </div>
      </section>

      {/* ── COMMUNICATION & TEAM MANAGEMENT ── */}
      <section className="mk-section mk-section-alt mk-capability" id="communication">
        <div className="mk-container mk-capability-grid mk-reverse">
          <div className="mk-capability-copy">
            <span className="mk-eyebrow">Communication &amp; Team Management</span>
            <h2 className="mk-display" style={{ fontSize: "var(--mk-text-3xl)" }}>Fundraising was just the beginning.</h2>
            <p style={{ color: "var(--mk-muted)", marginTop: "var(--mk-space-3)" }}>
              Announcements, direct messages, the roster, and the calendar all live in the same place coaches already check for donations.
            </p>
            <ul className="mk-capability-list">
              <li>Announcements and direct messaging for coaches, parents, and athletes</li>
              <li>Shared roster with class year, contact info, and athlete profiles</li>
              <li>Team calendar and an optional team shop, all in one hub</li>
            </ul>
          </div>
          <ProductPreview
            label="Team communications"
            image={{ src: "/marketing/communications.png", alt: "Real Team Communications view in the Elite Level Fundraising Team App, showing coach announcements about practice and an away game", width: 720, height: 900 }}
          />
        </div>
      </section>

      {/* ── SPONSORS & REPORTING ── */}
      <section className="mk-section mk-capability" id="sponsors">
        <div className="mk-container mk-capability-grid">
          <div className="mk-capability-copy">
            <span className="mk-eyebrow">Sponsors &amp; Reporting</span>
            <h2 className="mk-display" style={{ fontSize: "var(--mk-text-3xl)" }}>Your town has your back.</h2>
            <p style={{ color: "var(--mk-muted)", marginTop: "var(--mk-space-3)" }}>
              A dedicated CRM tracks every sponsor conversation, and reporting rolls it all up so coaches and ADs always know where things stand.
            </p>
            <ul className="mk-capability-list">
              <li>Sponsor CRM with activity history and renewal tracking</li>
              <li>Sponsor placement directly on your campaign page</li>
              <li>Reporting built for coaches, ADs, and booster leadership</li>
            </ul>
          </div>
          <ProductPreview
            label="Sponsor placement"
            image={{ src: "/marketing/sponsors.png", alt: "Real sponsor tier display on a demo Elite Level Fundraising campaign page, showing gold, silver, and bronze sponsor placements", width: 1000, height: 624 }}
          />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="mk-section mk-section-alt" id="how">
        <div className="mk-container">
          <div className="mk-section-head">
            <span className="mk-eyebrow">The process</span>
            <h2 className="mk-display" style={{ fontSize: "var(--mk-text-4xl)" }}>Build it. Share it. Get funded.</h2>
            <p>We keep it simple so coaches can focus on coaching, not admin.</p>
          </div>
          <div className="mk-steps mk-home-steps">
            <div className="mk-step">
              <span className="mk-step-num">01</span>
              <h3>Apply</h3>
              <p>Tell us about your team, sport, and goals. Takes less than five minutes.</p>
            </div>
            <div className="mk-step">
              <span className="mk-step-num">02</span>
              <h3>We build</h3>
              <p>We set up your branded page, add your athletes, and configure your team hub.</p>
            </div>
            <div className="mk-step">
              <span className="mk-step-num">03</span>
              <h3>You share</h3>
              <p>Send the link to players, parents, and your community with ready-made templates.</p>
            </div>
            <div className="mk-step">
              <span className="mk-step-num">04</span>
              <h3>Stay connected</h3>
              <p>Fundraising, communication, and your roster stay in one place all season.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── STORIES / BUILT FOR REAL TEAMS ──
          No real customer testimonial/quote exists yet anywhere in the repo
          (checked — see Phase 3 report). Per instructions not to invent one,
          this fills the "stories" slot with the same real, existing
          Coaches/ADs/Booster Clubs content as before, restyled as editorial
          columns instead of a 3-card grid. */}
      <section className="mk-section">
        <div className="mk-container">
          <div className="mk-section-head">
            <span className="mk-eyebrow">Built for real teams</span>
            <h2 className="mk-display" style={{ fontSize: "var(--mk-text-4xl)" }}>Real opportunities for real teams.</h2>
          </div>
          <div className="mk-story-grid">
            <div className="mk-story-col">
              <h3>Coaches</h3>
              <ul>
                <li>One login, not a group text and three spreadsheets</li>
                <li>Less time on admin, more time coaching</li>
                <li>Parent and athlete communication in one thread</li>
              </ul>
            </div>
            <div className="mk-story-col">
              <h3>Athletic Directors</h3>
              <ul>
                <li>Visibility across every team&rsquo;s fundraising</li>
                <li>Consistent tools across the whole department</li>
                <li>Sponsor relationships tracked, not lost to memory</li>
              </ul>
            </div>
            <div className="mk-story-col">
              <h3>Booster Clubs</h3>
              <ul>
                <li>Transparent, real-time fundraising totals</li>
                <li>A shared system instead of parallel spreadsheets</li>
                <li>Easier handoffs between volunteer leadership</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="mk-section mk-section-alt" id="faq">
        <div className="mk-container">
          <div className="mk-section-head" style={{ margin: "0 auto var(--mk-space-10)", textAlign: "center" }}>
            <span className="mk-eyebrow">Questions</span>
            <h2 style={{ fontSize: "var(--mk-text-3xl)" }}>Frequently asked questions</h2>
          </div>
          <FaqList items={FAQS} />
          <p style={{ textAlign: "center", marginTop: "var(--mk-space-8)" }}>
            <a href="/faq" style={{ fontWeight: 700, color: "var(--mk-ink)" }}>See the full FAQ &rarr;</a>
          </p>
        </div>
      </section>

      {/* ── FINAL CTA ──
          .mk-cta-band is shared with ~8 other marketing pages — reused
          unmodified here, only the copy/links below changed. */}
      <section className="mk-section mk-cta-band">
        <div className="mk-container-narrow">
          <h2 className="mk-display" style={{ fontSize: "var(--mk-text-4xl)" }}>Ready to fund your season?</h2>
          <p>No commitment. We&rsquo;ll walk through the platform using your sport as the example.</p>
          <div className="mk-hero-actions" style={{ justifyContent: "center" }}>
            <LinkButton href="/demo" size="lg">Get Started</LinkButton>
            <LinkButton href="/#how" variant="text" size="lg" style={{ color: "#fff" }}>See How ELF Works</LinkButton>
          </div>
          <span className="mk-hand" style={{ display: "block", marginTop: "var(--mk-space-6)", fontSize: "var(--mk-text-lg)" }}>
            no bake sales required.
          </span>
        </div>
      </section>
    </MarketingShell>
  );
}
