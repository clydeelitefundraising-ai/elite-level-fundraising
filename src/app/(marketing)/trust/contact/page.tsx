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
          <p>Elite Level Fundraising LLC &mdash; Phoenix, Arizona.</p>
        </div>
      </div>
      <div className="mk-section">
        <div className="mk-container-narrow mk-prose">
          <p>Elite Level Fundraising LLC</p>
          <p>Phoenix, Arizona</p>
          <p>
            Phone: <a href="tel:+16234988885">(623) 498-8885</a>
          </p>
          <p>
            Email: <a href="mailto:info@elitelevelfundraising.com">info@elitelevelfundraising.com</a>
          </p>
          <p>
            Website: <a href="https://elitelevelfundraising.com">https://elitelevelfundraising.com</a>
          </p>
        </div>
      </div>
    </>
  );
}
