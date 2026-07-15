import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Business Contact | Trust Center | Elite Level Fundraising",
  description: "How to reach Elite Level Fundraising directly.",
  alternates: { canonical: "/trust/contact" },
};

export default function TrustContactPage() {
  return (
    <>
      <div className="mk-page-hero">
        <div className="mk-container-narrow">
          <h1>Business Contact</h1>
          <p>Elite Level Fundraising &mdash; Phoenix, Arizona.</p>
        </div>
      </div>
      <div className="mk-section">
        <div className="mk-container-narrow mk-prose">
          <p>
            Support: <a href="mailto:support@elitelevelfundraising.com">support@elitelevelfundraising.com</a>
          </p>
          <div className="mk-notice">
            Full registered business entity name and mailing address are being finalized and will
            be published here. If you need this information sooner for a school or district
            procurement process, email us directly and we&rsquo;ll provide it.
          </div>
        </div>
      </div>
    </>
  );
}
