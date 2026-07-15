import "../../app/marketing-tokens.css";
import "../../app/marketing.css";
import type { ReactNode } from "react";
import { marketingFont } from "./fonts";
import { MarketingNav } from "./MarketingNav";
import { MarketingFooter } from "./MarketingFooter";

// Shared shell for every public marketing page. Rendered explicitly by each
// page (not via a Next.js layout.tsx at the app root) so that the root
// IS_APP / Team-App branch in src/app/page.tsx is untouched — this component
// has no relationship to /team, /admin, or /campaign.
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className={`mk-root ${marketingFont.variable}`} style={{ fontFamily: "var(--mk-font)" }}>
      <a href="#main-content" className="mk-skip-link">
        Skip to main content
      </a>
      <MarketingNav />
      <main id="main-content">{children}</main>
      <MarketingFooter />
    </div>
  );
}
