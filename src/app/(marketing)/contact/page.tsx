import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/marketing/Button";

export const metadata: Metadata = {
  title: "Contact | Elite Level Fundraising",
  description:
    "How to reach Elite Level Fundraising — general questions, demo requests, and where to find formal business contact information.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact | Elite Level Fundraising",
    description: "General questions and demo requests, answered by a person who knows the product.",
    type: "website",
  },
};

export default function ContactPage() {
  return (
    <>
      <div className="mk-page-hero">
        <div className="mk-container-narrow">
          <span className="mk-eyebrow">Contact</span>
          <h1>Get in touch</h1>
          <p>
            Whether you have a quick question or you&rsquo;re ready to see the platform, here&rsquo;s
            how to reach us.
          </p>
        </div>
      </div>

      <div className="mk-section">
        <div className="mk-container mk-contact-grid">
          <div className="mk-contact-card">
            <h2>Ready to see the platform?</h2>
            <p>
              The fastest way to get real answers &mdash; on features, timeline, and pricing &mdash;
              is a short demo built around your program.
            </p>
            <LinkButton href="/demo">Book a Free Demo</LinkButton>
          </div>
          <div className="mk-contact-card">
            <h2>General questions</h2>
            <p>
              Email us directly at{" "}
              <a href="mailto:info@elitelevelfundraising.com">info@elitelevelfundraising.com</a>{" "}
              or call <a href="tel:+16234988885">(623) 498-8885</a>. A person who knows the product
              answers &mdash; not a ticket queue. We aim to respond within one business day.
            </p>
            <p style={{ marginBottom: 0 }}>
              Looking for formal business contact information (for procurement, security
              disclosures, or legal purposes)? Visit{" "}
              <Link href="/trust/contact">Business Contact</Link> in the Trust Center.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
