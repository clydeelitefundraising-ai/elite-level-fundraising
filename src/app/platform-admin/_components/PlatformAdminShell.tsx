"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ADMIN_DESKTOP_MEDIA_QUERY,
  DRAWER_FOCUSABLE_SELECTOR,
  lockDocumentScroll,
  wrapFocusIndex,
} from "@/app/admin/adminDrawer";
import { isNativeApp, performNativeAwareLogout } from "@/lib/nativePushDevice";
import { ADMIN_NAV, BOTTOM_NAV, activeSectionId } from "@/lib/platformAdminNav";
import styles from "./PlatformAdminShell.module.css";

// Platform Admin shell: a permanent sidebar on desktop (≥900px, same
// breakpoint as the legacy /admin portal) and, on phones and in the
// installed iOS/Android apps, a top bar + slide-out navigation drawer plus a
// bottom bar (Home, Schools, Fundraising, More — More opens the drawer).
// Both are safe-area aware. Navigation comes from src/lib/platformAdminNav.ts.
// Authorization is NOT done here — the /platform-admin layout has already
// verified the Platform Admin account before this renders.

const DRAWER_ID = "platform-admin-nav";

export default function PlatformAdminShell({
  name,
  email,
  newInquiryCount = 0,
  children,
}: {
  name: string;
  email: string;
  newInquiryCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/platform-admin";
  const router = useRouter();
  const active = activeSectionId(pathname);
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);
  const close = useCallback(() => setOpen(false), []);
  const openFrom = (button: HTMLButtonElement) => { openerRef.current = button; setOpen(true); };

  // Close on any route change.
  const [drawerPath, setDrawerPath] = useState(pathname);
  if (drawerPath !== pathname) {
    setDrawerPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    const mq = window.matchMedia(ADMIN_DESKTOP_MEDIA_QUERY);
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setOpen(false); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // While open: lock scroll, focus into the drawer, trap Tab, Escape closes;
  // on close, focus returns to the button that opened it (menu or More).
  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        (openerRef.current ?? menuButtonRef.current)?.focus();
      }
      return;
    }
    wasOpenRef.current = true;
    const unlock = lockDocumentScroll(document);
    const drawer = drawerRef.current;
    const focusables = () => drawer ? Array.from(drawer.querySelectorAll<HTMLElement>(DRAWER_FOCUSABLE_SELECTOR)) : [];
    focusables()[0]?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
      if (e.key !== "Tab") return;
      const items = focusables();
      const next = wrapFocusIndex(items.indexOf(document.activeElement as HTMLElement), items.length, e.shiftKey);
      if (next !== null) { e.preventDefault(); items[next].focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); unlock(); };
  }, [open]);

  const activeLabel = ADMIN_NAV.find(s => s.id === active)?.label ?? "Platform Admin";
  const inBottomNav = BOTTOM_NAV.some(b => b.id === active);

  return (
    <div className={styles.shell} data-drawer-open={open ? "true" : "false"}>
      {open && <div className={styles.backdrop} aria-hidden="true" onClick={close} />}

      <aside
        ref={drawerRef}
        id={DRAWER_ID}
        className={styles.sidebar}
        aria-label="Platform Admin navigation"
        {...(open ? { role: "dialog", "aria-modal": true } : {})}
      >
        <div className={styles.brand}>
          <Link href="/platform-admin" className={styles.brandLink}>
            <span className={styles.brandMark} aria-hidden="true">ELF</span>
            <span>
              <span className={styles.brandTitle}>Platform Admin</span>
              <span className={styles.brandSub}>Elite Level Fundraising</span>
            </span>
          </Link>
          <button type="button" className={styles.drawerClose} aria-label="Close navigation menu" onClick={close}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <nav aria-label="Admin sections" className={styles.nav}>
          <ul className={styles.navList}>
            {ADMIN_NAV.map(section => {
              const isActive = section.id === active;
              const badge = section.id === "fundraising" && newInquiryCount > 0 ? newInquiryCount : 0;
              return (
                <li key={section.id}>
                  <Link
                    href={section.href}
                    className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                    aria-current={isActive ? "page" : undefined}
                    onClick={close}
                  >
                    <span className={styles.navIcon} aria-hidden="true">{section.icon}</span>
                    <span className={styles.navLabel}>{section.label}</span>
                    {badge > 0 && <span className={styles.badge} aria-label={`${badge} new fundraising inquiries`}>{badge}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={styles.account}>
          <div className={styles.accountName}>{name}</div>
          <div className={styles.accountEmail}>{email}</div>
          <Link href="/platform-admin/my-teams" className={styles.accountLink} onClick={close}>My Teams</Link>
          <form
            method="POST"
            action="/api/auth/logout"
            onSubmit={e => {
              if (!isNativeApp()) return;
              e.preventDefault();
              void performNativeAwareLogout(router);
            }}
          >
            <button type="submit" className={styles.signOut}>Sign out</button>
          </form>
        </div>
      </aside>

      <div className={styles.main} inert={open}>
        <header className={styles.topbar}>
          <button
            ref={menuButtonRef}
            type="button"
            className={styles.menuButton}
            aria-label="Open navigation menu"
            aria-expanded={open}
            aria-controls={DRAWER_ID}
            onClick={e => openFrom(e.currentTarget)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
          </button>
          <span className={styles.topbarTitle}>{activeLabel}</span>
        </header>
        <main className={styles.content}>{children}</main>

        <nav className={styles.bottomNav} aria-label="Quick navigation">
          <ul className={styles.bottomList}>
            {BOTTOM_NAV.map(item => {
              const isActive = item.id === active;
              const badge = item.id === "fundraising" && newInquiryCount > 0 ? newInquiryCount : 0;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={styles.bottomItem}
                    aria-current={isActive ? "page" : undefined}
                    data-active={isActive ? "true" : undefined}
                  >
                    <span className={styles.bottomIcon} aria-hidden="true">
                      {item.icon}
                      {badge > 0 && <span className={styles.bottomBadge}>{badge > 99 ? "99+" : badge}</span>}
                    </span>
                    <span className={styles.bottomLabel}>{item.label}</span>
                    {badge > 0 && <span className={styles.srOnly}>, {badge} new fundraising inquiries</span>}
                  </Link>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                className={styles.bottomItem}
                aria-label="More navigation"
                aria-expanded={open}
                aria-controls={DRAWER_ID}
                data-active={!inBottomNav && active !== null ? "true" : undefined}
                onClick={e => openFrom(e.currentTarget)}
              >
                <span className={styles.bottomIcon} aria-hidden="true">⋯</span>
                <span className={styles.bottomLabel}>More</span>
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
