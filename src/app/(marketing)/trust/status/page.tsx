import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "System Status | Trust Center | Elite Level Fundraising",
  description: "Current Elite Level Fundraising platform status.",
  alternates: { canonical: "/trust/status" },
};

export default function StatusPage() {
  return (
    <>
      <div className="mk-page-hero">
        <div className="mk-container-narrow">
          <h1>System Status</h1>
          <p>Current platform status, updated manually by our team.</p>
        </div>
      </div>
      <div className="mk-section">
        <div className="mk-container-narrow">
          <span className="mk-status-pill">● All systems operational</span>
          <div className="mk-notice">
            Status is updated manually rather than through automated monitoring — treat it as
            informational. If something seems wrong regardless of what&rsquo;s shown here, email{" "}
            <a href="mailto:support@elitelevelfundraising.com">support@elitelevelfundraising.com</a>.
          </div>
        </div>
      </div>
    </>
  );
}
