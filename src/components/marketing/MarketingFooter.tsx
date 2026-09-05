import Link from "next/link";

interface MarketingFooterProps {
  /** "minimal" = the mockup's 4-link footer (About/Pricing/Resources/
   * Contact + a handwritten tagline). Homepage only — every other marketing
   * page keeps the full Platform/Company/Trust Center footer below
   * unchanged, so legal/accessibility/trust links stay fully reachable
   * everywhere except the homepage, where they move to a subtle secondary
   * strip instead of disappearing. */
  variant?: "minimal";
}

export function MarketingFooter({ variant }: MarketingFooterProps) {
  const year = new Date().getFullYear();

  if (variant === "minimal") {
    return (
      <footer className="mk-footer mk-footer-minimal">
        <div className="mk-container mk-footer-minimal-row">
          <Link href="/" className="mk-footer-brand mk-footer-brand-minimal">
            ELF
            <span className="mk-footer-brand-sub">Elite Level Fundraising</span>
          </Link>
          <ul className="mk-footer-minimal-links">
            <li><Link href="/about">About</Link></li>
            <li><Link href="/pricing">Pricing</Link></li>
            <li><Link href="/faq">Resources</Link></li>
            <li><Link href="/contact">Contact</Link></li>
          </ul>
          <span className="mk-hand mk-footer-minimal-tagline">Built for what&rsquo;s next.</span>
        </div>
        {/* Legal/accessibility/trust links must stay reachable site-wide —
            kept here as a small, visually subordinate secondary strip rather
            than removed, per the mockup-fidelity approval notes. */}
        <div className="mk-container mk-footer-legal-strip">
          <span>&copy; {year} Elite Level Fundraising LLC &middot; Phoenix, Arizona</span>
          <nav aria-label="Legal and trust">
            <ul>
              <li><Link href="/trust">Trust Center</Link></li>
              <li><Link href="/legal/terms">Terms</Link></li>
              <li><Link href="/legal/cookies">Cookie Policy</Link></li>
              <li><Link href="/trust/accessibility">Accessibility</Link></li>
              <li><Link href="/trust/status">System Status</Link></li>
            </ul>
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <footer className="mk-footer">
      <div className="mk-container">
        <div className="mk-footer-grid">
          <div>
            <Link href="/" className="mk-footer-brand">
              ELITE LEVEL FUNDRAISING
            </Link>
            <p className="mk-footer-tagline">
              The operating system for athletic programs. Proudly serving Arizona schools, built to support programs nationwide.
            </p>
          </div>

          <div>
            <div className="mk-footer-col-title">Platform</div>
            <ul className="mk-footer-links">
              <li><Link href="/product">Product</Link></li>
              <li><Link href="/fundraising">Fundraising</Link></li>
              <li><Link href="/communication">Communication</Link></li>
              <li><Link href="/sponsors">Sponsors &amp; Reporting</Link></li>
              <li><Link href="/#how">How It Works</Link></li>
            </ul>
          </div>

          <div>
            <div className="mk-footer-col-title">Company</div>
            <ul className="mk-footer-links">
              <li><Link href="/why-elf">Why ELF</Link></li>
              <li><Link href="/about">About</Link></li>
              <li><Link href="/pricing">Pricing</Link></li>
              <li><Link href="/demo">Book a Demo</Link></li>
              <li><Link href="/contact">Contact</Link></li>
              <li><Link href="/faq">FAQ</Link></li>
            </ul>
          </div>

          <div>
            <div className="mk-footer-col-title">Trust Center</div>
            <ul className="mk-footer-links">
              <li><Link href="/trust/security">Security</Link></li>
              <li><Link href="/trust/privacy">Privacy</Link></li>
              <li><Link href="/trust/accessibility">Accessibility</Link></li>
              <li><Link href="/trust/compliance">Compliance</Link></li>
              <li><Link href="/trust/data-protection">Data Protection</Link></li>
            </ul>
          </div>
        </div>

        <div className="mk-footer-bottom">
          <span>&copy; {year} Elite Level Fundraising LLC &middot; Phoenix, Arizona &middot; (623) 498-8885</span>
          <nav aria-label="Legal">
            <ul className="mk-footer-links" style={{ flexDirection: "row", gap: "var(--mk-space-6)" }}>
              <li><Link href="/legal/terms">Terms</Link></li>
              <li><Link href="/legal/cookies">Cookie Policy</Link></li>
              <li><Link href="/trust/status">System Status</Link></li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
