"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export interface NavLink {
  href: string;
  label: string;
}

const NAV_LINKS: NavLink[] = [
  { href: "/product", label: "Product" },
  { href: "/#how", label: "How It Works" },
  { href: "/why-elf", label: "Why ELF" },
  { href: "/pricing", label: "Pricing" },
  { href: "/trust", label: "Trust Center" },
  { href: "/faq", label: "FAQ" },
];

interface MarketingNavProps {
  /** "overlay" = transparent over the hero photo, white text, solidifies to
   * the normal bar once the page scrolls past the hero, mockup-style logo
   * badge + Log in/Get Started actions. Homepage only — every other page
   * gets the unchanged default bar below. */
  variant?: "overlay";
  /** Homepage-only override of the link set/order/wording — see
   * MarketingPage.tsx for the mockup-fidelity mapping and rationale. Every
   * other marketing page keeps the default NAV_LINKS above, untouched. */
  links?: NavLink[];
}

export function MarketingNav({ variant, links }: MarketingNavProps) {
  const [open, setOpen] = useState(false);
  const [elevated, setElevated] = useState(false);
  const navLinks = links ?? NAV_LINKS;
  const isOverlayVariant = variant === "overlay";

  // Close the mobile panel on route/hash change and Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  // Subtle elevation once the page scrolls past the hero, so the sticky
  // nav reads as "lifted" over content instead of always flat. For the
  // overlay variant this is also the signal to flip from transparent/white
  // (over the photo) to the normal solid bar.
  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const overlayActive = isOverlayVariant && !elevated && !open;

  return (
    <header
      className={`mk-nav${elevated ? " mk-nav-elevated" : ""}${overlayActive ? " mk-nav-overlay" : ""}`}
    >
      <nav className="mk-nav-inner" aria-label="Primary">
        {isOverlayVariant ? (
          <Link href="/" className="mk-nav-logo mk-nav-logo-badged" onClick={() => setOpen(false)}>
            <span className="mk-nav-logo-chip" aria-hidden="true" />
            <span className="mk-nav-logo-text">
              ELF
              <svg className="mk-nav-logo-spark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2 L13.6 8.4 L20 10 L13.6 11.6 L12 18 L10.4 11.6 L4 10 L10.4 8.4 Z" />
              </svg>
            </span>
            <span className="mk-nav-logo-sub">Elite Level Fundraising</span>
          </Link>
        ) : (
          <Link href="/" className="mk-nav-logo" onClick={() => setOpen(false)}>
            ELITE LEVEL <span>FUNDRAISING</span>
          </Link>
        )}

        <ul className="mk-nav-links">
          {navLinks.map((l) => (
            <li key={l.href}>
              <Link href={l.href}>{l.label}</Link>
            </li>
          ))}
        </ul>

        <div className="mk-nav-actions">
          {isOverlayVariant && (
            <Link href="/login" className="mk-nav-login">
              Log in
            </Link>
          )}
          <Link href="/demo" className="mk-btn mk-btn-primary mk-btn-ghost-nav">
            {isOverlayVariant ? "Get Started" : "Book a Demo"}
          </Link>
          <button
            type="button"
            className="mk-nav-menu-btn"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mk-mobile-panel"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {open && (
        <div id="mk-mobile-panel" className="mk-mobile-panel" role="dialog" aria-modal="true" aria-label="Menu">
          <ul>
            {navLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)}>
                  {l.label}
                </Link>
              </li>
            ))}
            {isOverlayVariant && (
              <li><Link href="/login" onClick={() => setOpen(false)}>Log in</Link></li>
            )}
          </ul>
          <Link href="/demo" className="mk-btn mk-btn-primary mk-btn-lg mk-btn-block" onClick={() => setOpen(false)}>
            {isOverlayVariant ? "Get Started" : "Book a Demo"}
          </Link>
        </div>
      )}
    </header>
  );
}
