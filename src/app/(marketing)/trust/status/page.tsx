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
          <p>This page is a placeholder for a future live status feed. For now, it reflects a manually-updated status.</p>
        </div>
      </div>
      <div className="mk-section">
        <div className="mk-container-narrow">
          <span className="mk-status-pill">● All systems operational</span>
          <div className="mk-notice">
            We don&rsquo;t yet have automated uptime monitoring wired into this page — treat the status
            above as informational, not a live feed. If something seems wrong, email{" "}
            <a href="mailto:support@elitelevelfundraising.com">support@elitelevelfundraising.com</a>.
          </div>
        </div>
      </div>
    </>
  );
}
