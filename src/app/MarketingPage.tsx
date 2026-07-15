import { MarketingShell } from "@/components/marketing/MarketingShell";
import { LinkButton } from "@/components/marketing/Button";
import { ProductPreview } from "@/components/marketing/ProductPreview";

// Anchors here must match the section ids below exactly — one card per
// section, no duplicates.
const MODULES = [
  {
    id: "fundraising",
    num: "01",
    title: "Fundraising",
    desc: "Athlete pages, live leaderboards, and transparent Stripe-secured payments.",
  },
  {
    id: "communication",
    num: "02",
    title: "Communication",
    desc: "Announcements, messages, roster, and calendar — one thread instead of five.",
  },
  {
    id: "sponsors",
    num: "03",
    title: "Sponsors & Reporting",
    desc: "A CRM built to match your program with local businesses ready to invest.",
  },
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
            <h1>The operating system for athletic programs.</h1>
            <p className="mk-hero-sub">
              Fundraising, communication, and team management in one platform &mdash;
              built so coaches spend less time on admin and more time coaching.
            </p>
            <div className="mk-hero-actions">
              <LinkButton href="/demo" size="lg">Book a Free Demo</LinkButton>
              <LinkButton href="/#platform" variant="secondary" size="lg">See the Platform</LinkButton>
            </div>
            <p className="mk-hero-note">No commitment. 20 minutes. Built around your program.</p>
          </div>

          <div className="mk-hero-visual">
            <ProductPreview label="Team Fundraising">
              <div className="mk-preview-row">
                <span className="mk-preview-row-label">Track &amp; Field Boosters</span>
                <span className="mk-preview-bar"><span className="mk-preview-bar-fill" style={{ width: "68%" }} /></span>
                <span className="mk-preview-row-value">68% to goal</span>
              </div>
              <div className="mk-preview-row">
                <span className="mk-preview-row-label">Top athlete</span>
                <span className="mk-preview-bar" style={{ visibility: "hidden" }} />
                <span className="mk-preview-row-value">J. Ramirez</span>
              </div>
              <div className="mk-preview-row">
                <span className="mk-preview-row-label">Status</span>
                <span className="mk-preview-bar" style={{ visibility: "hidden" }} />
                <span className="mk-preview-row-value">Live campaign page</span>
              </div>
            </ProductPreview>
          </div>
        </div>
      </section>

      {/* ── TRUST BAND ── */}
      <section className="mk-trust-band">
        <div className="mk-container mk-trust-grid">
          <div className="mk-trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4z" /></svg>
            <div><h4>Secure payments</h4><p>Every donation runs through Stripe. We never store card details.</p></div>
          </div>
          <div className="mk-trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 21s7-6.1 7-11.5A7 7 0 105 9.5C5 14.9 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.4" /></svg>
            <div><h4>Built in Arizona</h4><p>Headquartered in Phoenix, built for schools first &mdash; not adapted from something else.</p></div>
          </div>
          <div className="mk-trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" /></svg>
            <div><h4>Built with coaches</h4><p>Every feature is shaped by direct feedback from the coaches using it.</p></div>
          </div>
          <div className="mk-trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 22c5.5-1.6 9-6 9-11V5l-9-3-9 3v6c0 5 3.5 9.4 9 11z" /></svg>
            <div><h4>Real Trust Center</h4><p>Security, privacy, and accessibility practices, documented and public.</p></div>
          </div>
          <div className="mk-trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M13 2L4.5 13H11l-1 9L20 10h-6.5l-0.5-8z" /></svg>
            <div><h4>Direct support</h4><p>When you email us, a person who knows the product answers.</p></div>
          </div>
        </div>
      </section>

      {/* ── PROBLEM ── */}
      <section className="mk-section">
        <div className="mk-container mk-problem-grid">
          <div>
            <span className="mk-eyebrow">The problem</span>
            <h2 style={{ fontSize: "var(--mk-text-3xl)" }}>Running a program shouldn&rsquo;t mean juggling five different apps.</h2>
          </div>
          <ul className="mk-problem-list">
            <li>A fundraising tool for donations, a group text for parents, a spreadsheet for the roster, a separate inbox for sponsors.</li>
            <li>Coaches spend hours a week on admin instead of practice planning.</li>
            <li>Nothing talks to anything else, so nothing important stays tracked for long.</li>
          </ul>
        </div>
      </section>

      {/* ── PLATFORM OVERVIEW ── */}
      <section className="mk-section mk-section-alt" id="platform">
        <div className="mk-container">
          <div className="mk-section-head">
            <span className="mk-eyebrow">One platform</span>
            <h2 style={{ fontSize: "var(--mk-text-3xl)" }}>Less chaos. Better communication. More fundraising.</h2>
            <p>Three modules, one system of record — fundraising is where we started, not where the platform ends.</p>
          </div>
          <div className="mk-module-grid">
            {MODULES.map((m) => (
              <a href={`/#${m.id}`} className="mk-module-card" key={m.title}>
                <span className="mk-module-num">{m.num}</span>
                <h3>{m.title}</h3>
                <p>{m.desc}</p>
              </a>
            ))}
          </div>
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
          <ProductPreview label="Athlete Leaderboard">
            <div className="mk-preview-row">
              <span className="mk-preview-row-label">1. J. Ramirez</span>
              <span className="mk-preview-bar"><span className="mk-preview-bar-fill" style={{ width: "100%" }} /></span>
            </div>
            <div className="mk-preview-row">
              <span className="mk-preview-row-label">2. A. Chen</span>
              <span className="mk-preview-bar"><span className="mk-preview-bar-fill" style={{ width: "78%" }} /></span>
            </div>
            <div className="mk-preview-row">
              <span className="mk-preview-row-label">3. M. Torres</span>
              <span className="mk-preview-bar"><span className="mk-preview-bar-fill" style={{ width: "64%" }} /></span>
            </div>
          </ProductPreview>
        </div>
      </section>

      {/* ── COMMUNICATION & TEAM MANAGEMENT ── */}
      <section className="mk-section mk-section-alt mk-capability" id="communication">
        <div className="mk-container mk-capability-grid mk-reverse">
          <div className="mk-capability-copy">
            <span className="mk-eyebrow">Communication &amp; Team Management</span>
            <h2 style={{ fontSize: "var(--mk-text-2xl)" }}>One thread instead of five.</h2>
            <p style={{ color: "var(--mk-muted)", marginTop: "var(--mk-space-3)" }}>
              Announcements, direct messages, the roster, and the calendar all live in the same place coaches already check for donations.
            </p>
            <ul className="mk-capability-list">
              <li>Announcements and direct messaging for coaches, parents, and athletes</li>
              <li>Shared roster with class year, contact info, and athlete profiles</li>
              <li>Team calendar and an optional team shop, all in one hub</li>
            </ul>
          </div>
          <ProductPreview label="Team Communication">
            <div className="mk-thread">
              <div className="mk-thread-msg">
                <span className="mk-thread-avatar">C</span>
                <div className="mk-thread-body">
                  <div className="mk-thread-meta"><span className="mk-thread-name">Coach</span><span className="mk-thread-time">2h ago</span></div>
                  <p className="mk-thread-text">Practice moved to 4pm today &mdash; same field.</p>
                </div>
              </div>
              <div className="mk-thread-msg">
                <span className="mk-thread-avatar">P</span>
                <div className="mk-thread-body">
                  <div className="mk-thread-meta"><span className="mk-thread-name">Parent</span><span className="mk-thread-time">1h ago</span></div>
                  <p className="mk-thread-text">Got it, thank you.</p>
                </div>
              </div>
              <div className="mk-thread-msg">
                <span className="mk-thread-avatar">T</span>
                <div className="mk-thread-body">
                  <div className="mk-thread-meta"><span className="mk-thread-name">Team Calendar</span><span className="mk-thread-time">Today</span></div>
                  <p className="mk-thread-text">Away game added &mdash; Saturday, 10am.</p>
                </div>
              </div>
            </div>
          </ProductPreview>
        </div>
      </section>

      {/* ── SPONSORS & REPORTING ── */}
      <section className="mk-section mk-capability" id="sponsors">
        <div className="mk-container mk-capability-grid">
          <div className="mk-capability-copy">
            <span className="mk-eyebrow">Sponsors &amp; Reporting</span>
            <h2 style={{ fontSize: "var(--mk-text-2xl)" }}>Sponsor relationships that don&rsquo;t rely on memory.</h2>
            <p style={{ color: "var(--mk-muted)", marginTop: "var(--mk-space-3)" }}>
              A dedicated CRM tracks every sponsor conversation, and reporting rolls it all up so coaches and ADs always know where things stand.
            </p>
            <ul className="mk-capability-list">
              <li>Sponsor CRM with activity history and renewal tracking</li>
              <li>Sponsor placement directly on your campaign page</li>
              <li>Reporting built for coaches, ADs, and booster leadership</li>
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

      {/* ── HOW IT WORKS ── */}
      <section className="mk-section mk-section-alt" id="how">
        <div className="mk-container">
          <div className="mk-section-head">
            <span className="mk-eyebrow">The process</span>
            <h2 style={{ fontSize: "var(--mk-text-3xl)" }}>How it works</h2>
            <p>We keep it simple so coaches can focus on coaching, not admin.</p>
          </div>
          <div className="mk-steps">
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

      {/* ── AUDIENCE VALUE ── */}
      <section className="mk-section">
        <div className="mk-container">
          <div className="mk-section-head">
            <span className="mk-eyebrow">Built for your role</span>
            <h2 style={{ fontSize: "var(--mk-text-3xl)" }}>Whoever you are on the team, it&rsquo;s built around your day.</h2>
          </div>
          <div className="mk-audience-grid">
            <div className="mk-audience-card">
              <h3>Coaches</h3>
              <ul>
                <li>One login, not a group text and three spreadsheets</li>
                <li>Less time on admin, more time coaching</li>
                <li>Parent and athlete communication in one thread</li>
              </ul>
            </div>
            <div className="mk-audience-card">
              <h3>Athletic Directors</h3>
              <ul>
                <li>Visibility across every team&rsquo;s fundraising</li>
                <li>Consistent tools across the whole department</li>
                <li>Sponsor relationships tracked, not lost to memory</li>
              </ul>
            </div>
            <div className="mk-audience-card">
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
          <div className="mk-faq">
            {FAQS.map((f) => (
              <details className="mk-faq-item" key={f.q}>
                <summary>
                  {f.q}
                  <span className="mk-faq-icon" aria-hidden="true">+</span>
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="mk-section mk-cta-band">
        <div className="mk-container-narrow">
          <h2>See it running for a program like yours.</h2>
          <p>No commitment. We&rsquo;ll walk through the platform using your sport as the example.</p>
          <LinkButton href="/demo" size="lg">Book a Free Demo</LinkButton>
        </div>
      </section>
    </MarketingShell>
  );
}
