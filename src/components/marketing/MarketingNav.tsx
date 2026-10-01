"use client";

import Link from "next/link";
import Image from "next/image";
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

// Canonical marketing navigation (approved homepage header) — single source
// of truth for link set/order/wording, consumed by both MarketingPage.tsx
// (variant="overlay") and the shared (marketing)/layout.tsx (variant="dark")
// so every public marketing page presents the identical nav. Mapped to the
// closest existing real route where the approved label has no exact-name
// match (see the Phase 7 report / marketing header standardization audit
// for the full rationale):
//   HOW IT WORKS -> /product       (closest platform-overview page; no
//                                    dedicated "how it works" route exists)
//   TEAMS        -> /communication (team management/roster/messaging)
//   SPONSORS     -> /sponsors      (exact match)
//   PRICING      -> /pricing       (exact match)
//   RESOURCES    -> /faq           (closest "resource-ish" existing page)
export const MARKETING_NAV_LINKS: NavLink[] = [
  { href: "/product", label: "How It Works" },
  { href: "/communication", label: "Teams" },
  { href: "/sponsors", label: "Sponsors" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "Resources" },
];

interface MarketingNavProps {
  /** "overlay" = transparent over the hero photo, white text, solidifies to
   * the normal bar once the page scrolls past the hero, mockup-style logo
   * badge + Log in/Get Started actions. Homepage only.
   * "dark" = the same approved logo/nav/Log in/Get Started treatment as
   * "overlay", but always a solid near-black bar in normal document flow —
   * no hero photo, no scroll-triggered transparency/elevation. Used by
   * every other public marketing page (see (marketing)/layout.tsx).
   * Omitted = the original/legacy bar (white background, old wordmark,
   * old link set, "Book a Demo") — kept as-is, not removed, for any caller
   * that doesn't pass a variant. */
  variant?: "overlay" | "dark";
  /** Override of the link set/order/wording — both branded variants
   * (overlay/dark) are expected to pass MARKETING_NAV_LINKS above. Omitted
   * (legacy bar) keeps the default NAV_LINKS above, untouched. */
  links?: NavLink[];
}

export function MarketingNav({ variant, links }: MarketingNavProps) {
  const [open, setOpen] = useState(false);
  const [elevated, setElevated] = useState(false);
  const navLinks = links ?? NAV_LINKS;
  const isOverlayVariant = variant === "overlay";
  const isDarkVariant = variant === "dark";
  // Both branded variants share the same logo/Log-in/Get-Started treatment —
  // only "overlay" additionally gets the hero-photo transparency/scroll
  // behavior below.
  const isBrandedVariant = isOverlayVariant || isDarkVariant;

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

  // `mk-nav-hero` is applied for the ENTIRE lifetime of the overlay-variant
  // nav (both before and after the scroll threshold) — it's what pulls the
  // hero photo up underneath the nav via a constant negative margin, so the
  // nav's own contribution to document flow height never changes. Only
  // `mk-nav-overlay` (transparent bg, before scrolling) toggles. Previously
  // `position` itself flipped between absolute (0 flow height) and sticky
  // (full flow height) exactly at the scroll threshold, which inserted/
  // removed a full nav-height of space in the document at that instant —
  // shifting every section below the hero down by that amount and making it
  // look like the sticky bar was "swallowing" whatever content happened to
  // be at the top of the viewport when it fired. Keeping the nav always
  // sticky and always flow-neutral (via the constant negative margin)
  // removes that jump entirely; only its background/border repaint on scroll.
  return (
    <header
      className={`mk-nav${elevated ? " mk-nav-elevated" : ""}${isOverlayVariant ? " mk-nav-hero" : ""}${overlayActive ? " mk-nav-overlay" : ""}${isDarkVariant ? " mk-nav-dark" : ""}`}
    >
      <nav className="mk-nav-inner" aria-label="Primary">
        {isBrandedVariant ? (
          <Link href="/" className="mk-nav-logo mk-nav-logo-mark" onClick={() => setOpen(false)}>
            <Image
              src="/marketing/brand/elf-logo-horizontal.png"
              alt="Elite Level Fundraising"
              width={2172}
              height={724}
              priority
              className="mk-nav-logo-img"
            />
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
          {isBrandedVariant && (
            <Link href="/login" className="mk-nav-login">
              Log in
            </Link>
          )}
          <Link href="/demo" className="mk-btn mk-btn-primary mk-btn-ghost-nav">
            {isBrandedVariant ? "Get Started" : "Book a Demo"}
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
            {isBrandedVariant && (
              <li><Link href="/login" onClick={() => setOpen(false)}>Log in</Link></li>
            )}
          </ul>
          <Link href="/demo" className="mk-btn mk-btn-primary mk-btn-lg mk-btn-block" onClick={() => setOpen(false)}>
            {isBrandedVariant ? "Get Started" : "Book a Demo"}
          </Link>
        </div>
      )}
    </header>
  );
}
