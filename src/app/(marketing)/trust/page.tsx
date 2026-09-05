import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Trust Center | Elite Level Fundraising",
  description:
    "How Elite Level Fundraising handles security, privacy, accessibility, and data protection for schools and athletic programs.",
  alternates: { canonical: "/trust" },
};

const PAGES = [
  { href: "/trust/security", title: "Security", desc: "How payments and platform access are protected." },
  { href: "/trust/privacy", title: "Privacy", desc: "What we collect, why, and how it's used." },
  { href: "/trust/accessibility", title: "Accessibility", desc: "Our WCAG 2.2 AA target and how we're getting there." },
  { href: "/trust/compliance", title: "Compliance", desc: "Where we stand on school-data-related regulation." },
  { href: "/trust/data-protection", title: "Data Protection", desc: "Retention, deletion, and sub-processors." },
  { href: "/trust/status", title: "System Status", desc: "Current platform availability." },
  { href: "/trust/contact", title: "Business Contact", desc: "How to reach us directly." },
];

const LEGAL_PAGES = [
  { href: "/legal/terms", title: "Terms of Service" },
  { href: "/legal/cookies", title: "Cookie Policy" },
  { href: "/legal/acceptable-use", title: "Acceptable Use Policy" },
];

export default function TrustIndexPage() {
  return (
    <>
      <div className="mk-page-hero mk-page-hero-trust">
        <div className="mk-container-narrow">
          <h1>Trust Center</h1>
          <p>
            Elite Level Fundraising LLC is a newly formed company. Trust comes from how the
            platform is built and how directly we answer questions — this page is where we keep
            that in one place.
          </p>
        </div>
      </div>
      <div className="mk-section">
        <div className="mk-container mk-trust-index-grid">
          {PAGES.map((p) => (
            <Link href={p.href} className="mk-module-card" key={p.href}>
              <h2>{p.title}</h2>
              <p>{p.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="mk-section mk-section-alt">
        <div className="mk-container-narrow">
          <h2 style={{ fontSize: "var(--mk-text-xl)", marginBottom: "var(--mk-space-4)" }}>Legal documents</h2>
          <p style={{ color: "var(--mk-muted)", marginBottom: "var(--mk-space-6)" }}>
            Each page below describes our current policies in plain language.
          </p>
          <ul className="mk-capability-list">
            {LEGAL_PAGES.map((p) => (
              <li key={p.href}><Link href={p.href} style={{ textDecoration: "underline", fontWeight: 600, color: "var(--mk-ink)" }}>{p.title}</Link></li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
