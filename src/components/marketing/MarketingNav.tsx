"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const NAV_LINKS = [
  { href: "/#platform", label: "Platform" },
  { href: "/#how", label: "How It Works" },
  { href: "/trust", label: "Trust Center" },
  { href: "/#faq", label: "FAQ" },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const [elevated, setElevated] = useState(false);

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
  // nav reads as "lifted" over content instead of always flat.
  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`mk-nav${elevated ? " mk-nav-elevated" : ""}`}>
      <nav className="mk-nav-inner" aria-label="Primary">
        <Link href="/" className="mk-nav-logo" onClick={() => setOpen(false)}>
          ELITE LEVEL <span>FUNDRAISING</span>
        </Link>

        <ul className="mk-nav-links">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href}>{l.label}</Link>
            </li>
          ))}
        </ul>

        <div className="mk-nav-actions">
          <Link href="/demo" className="mk-btn mk-btn-primary mk-btn-ghost-nav">
            Book a Demo
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
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/demo" className="mk-btn mk-btn-primary mk-btn-lg mk-btn-block" onClick={() => setOpen(false)}>
            Book a Demo
          </Link>
        </div>
      )}
    </header>
  );
}
