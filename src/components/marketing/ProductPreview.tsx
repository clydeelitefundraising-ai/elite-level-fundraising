import type { ReactNode } from "react";

// Shared "browser chrome" frame for every illustrative UI mockup on the
// marketing site. Every instance carries a visible "Product preview —
// illustrative" tag so nothing can be mistaken for real customer data.
// When real product screenshots are captured, swap `children` for an
// <Image> inside .mk-preview-body — the chrome/label/tag wrapper stays.
export function ProductPreview({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mk-preview-frame" aria-hidden="true">
      <div className="mk-preview-chrome">
        <span className="mk-preview-dots">
          <span />
          <span />
          <span />
        </span>
        <span className="mk-preview-tag">Product preview &mdash; illustrative</span>
      </div>
      <div className="mk-preview-body">
        <div className="mk-preview-label">{label}</div>
        {children}
      </div>
    </div>
  );
}
