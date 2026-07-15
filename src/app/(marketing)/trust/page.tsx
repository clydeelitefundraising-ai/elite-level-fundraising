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

export default function TrustIndexPage() {
  return (
    <>
      <div className="mk-page-hero">
        <div className="mk-container-narrow">
          <h1>Trust Center</h1>
          <p>
            We don&rsquo;t have a decade of case studies yet — so trust has to come from how the
            platform is built and how directly we answer questions. This page is where we keep
            that honest, in one place.
          </p>
        </div>
      </div>
      <div className="mk-section">
        <div className="mk-container mk-trust-index-grid">
          {PAGES.map((p) => (
            <Link href={p.href} className="mk-module-card" key={p.href}>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
