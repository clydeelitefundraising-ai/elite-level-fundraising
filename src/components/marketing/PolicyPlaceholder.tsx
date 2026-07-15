import type { ReactNode } from "react";

interface PolicyPlaceholderProps {
  title: string;
  summary: string;
  children?: ReactNode;
}

// Shared template for Trust Center / legal pages whose final legal copy
// hasn't been drafted or reviewed yet. Renders an explicit "in progress"
// notice — never presents itself as a finished policy, and never states
// unverified claims (certifications, compliance status, etc.).
export function PolicyPlaceholder({ title, summary, children }: PolicyPlaceholderProps) {
  return (
    <>
      <div className="mk-page-hero">
        <div className="mk-container-narrow">
          <h1>{title}</h1>
          <p>{summary}</p>
        </div>
      </div>
      <div className="mk-section">
        <div className="mk-container-narrow mk-prose">
          {children}
          <div className="mk-notice">
            This page is being finalized. It does not yet constitute a complete or legally binding policy.
            For questions in the meantime, contact{" "}
            <a href="mailto:support@elitelevelfundraising.com">support@elitelevelfundraising.com</a>.
          </div>
        </div>
      </div>
    </>
  );
}
