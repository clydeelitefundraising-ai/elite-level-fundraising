import type { ReactNode } from "react";

interface PolicyPlaceholderProps {
  title: string;
  summary: string;
  children?: ReactNode;
}

// Shared template for Trust Center / legal pages. Renders a plain-language
// summary — never presents itself as a comprehensive legal document, and
// never states unverified claims (certifications, compliance status, etc.).
export function PolicyPlaceholder({ title, summary, children }: PolicyPlaceholderProps) {
  return (
    <>
      <div className="mk-page-hero mk-page-hero-trust">
        <div className="mk-container-narrow">
          <h1>{title}</h1>
          <p>{summary}</p>
        </div>
      </div>
      <div className="mk-section">
        <div className="mk-container-narrow mk-prose">
          {children}
          <div className="mk-notice">
            This page is a plain-language summary published by Elite Level Fundraising LLC, not an
            exhaustive legal document. For questions about specific terms, contact{" "}
            <a href="mailto:support@elitelevelfundraising.com">support@elitelevelfundraising.com</a>.
          </div>
        </div>
      </div>
    </>
  );
}
