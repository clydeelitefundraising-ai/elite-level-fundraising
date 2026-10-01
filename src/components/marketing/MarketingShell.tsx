import "../../app/marketing-tokens.css";
import "../../app/marketing.css";
import type { ReactNode } from "react";
import { marketingFont, marketingDisplayFont, marketingHandFont, marketingHeroFont } from "./fonts";
import { MarketingNav, type NavLink } from "./MarketingNav";
import { MarketingFooter } from "./MarketingFooter";

interface MarketingShellProps {
  children: ReactNode;
  /** "overlay" = transparent/over-photo nav that solidifies on scroll — used
   * only by the homepage hero. "dark" = the same approved logo/nav/Log-in/
   * Get-Started treatment, always a solid near-black bar in normal document
   * flow — used by every other public marketing page (see
   * (marketing)/layout.tsx). Omitted = the original/legacy bar. */
  navVariant?: "overlay" | "dark";
  /** Nav link override — both branded variants (overlay/dark) pass the
   * canonical MARKETING_NAV_LINKS from MarketingNav.tsx. Omitted (legacy
   * bar) keeps the existing default NAV_LINKS untouched. */
  navLinks?: NavLink[];
  /** "minimal" = the mockup's 4-link footer, used only by the homepage.
   * Every other page keeps the full Platform/Company/Trust Center footer. */
  footerVariant?: "minimal";
}

// Shared shell for every public marketing page. Rendered explicitly by each
// page (not via a Next.js layout.tsx at the app root) so that the root
// IS_APP / Team-App branch in src/app/page.tsx is untouched — this component
// has no relationship to /team, /admin, or /campaign.
export function MarketingShell({ children, navVariant, navLinks, footerVariant }: MarketingShellProps) {
  return (
    <div
      className={`mk-root ${marketingFont.variable} ${marketingDisplayFont.variable} ${marketingHandFont.variable} ${marketingHeroFont.variable}`}
      style={{ fontFamily: "var(--mk-font)" }}
    >
      <a href="#main-content" className="mk-skip-link">
        Skip to main content
      </a>
      <MarketingNav variant={navVariant} links={navLinks} />
      <main id="main-content">{children}</main>
      <MarketingFooter variant={footerVariant} />
    </div>
  );
}
