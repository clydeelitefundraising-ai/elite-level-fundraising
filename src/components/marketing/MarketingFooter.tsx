import Link from "next/link";

export function MarketingFooter() {
  const year = new Date().getFullYear();

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
              <li><Link href="/#fundraising">Fundraising</Link></li>
              <li><Link href="/#communication">Communication &amp; Team Management</Link></li>
              <li><Link href="/#sponsors">Sponsors &amp; Reporting</Link></li>
              <li><Link href="/#how">How It Works</Link></li>
            </ul>
          </div>

          <div>
            <div className="mk-footer-col-title">Company</div>
            <ul className="mk-footer-links">
              <li><Link href="/demo">Book a Demo</Link></li>
              <li><Link href="/trust/contact">Contact</Link></li>
              <li><Link href="/#faq">FAQ</Link></li>
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
          <span>&copy; {year} Elite Level Fundraising &middot; Phoenix, Arizona</span>
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
