"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, User, Users, Settings as SettingsIcon, LogOut, Plus, X } from "lucide-react";
import type { TeamSummary } from "@/lib/accountSession";
import PushOptIn from "./PushOptIn";
import { useBodyScrollLock } from "./Modal";
import { isNativeApp, performNativeAwareLogout } from "@/lib/nativePushDevice";
import {
  DRAWER_FOCUSABLE,
  DRAWER_WIDTH,
  drawerCloseDelayMs,
  drawerKeyAction,
  drawerTransition,
} from "./accountDrawer";

declare global {
  interface Window {
    __elfHasOpenOverlay?: () => boolean;
  }
}

// Mounted only while the drawer is, so Modal's iOS-safe body scroll lock
// (the page behind can't scroll through the overlay) applies exactly while
// it's open — the same lock every Modal uses.
function DrawerScrollLock() {
  useBodyScrollLock();
  return null;
}

function initialsOf(name?: string): string | null {
  return name
    ? name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("")
    : null;
}

export default function AccountMenu({
  currentSlug,
  teams,
  accountName,
  profilePhotoUrl,
  onDark = false,
  hasAccountSession = false,
  isMember = false,
}: {
  currentSlug:     string;
  teams:           TeamSummary[];
  accountName?:    string;
  profilePhotoUrl?: string | null;
  /** Phase 3: this component is mounted on two different backgrounds —
   *  TeamHeader (now white/warm-white after the Phase 3 redesign) and
   *  DesktopSidebar (near-black --shell-backdrop). The toggle button's
   *  own colors need to invert between those two contexts to stay legible
   *  — everything else (the drawer itself) is always white regardless of
   *  onDark, since it's an overlay, not part of either shell surface. */
  onDark?: boolean;
  /** Identity Compatibility follow-up: true only when an elf_session
   *  (accountSession) exists — false for a legacy team_coach/team_member
   *  cookie-only session, even though isAuthenticated (this component only
   *  mounts at all when isAuthenticated) is true for both. Threaded down
   *  from layout.tsx's already-resolved accountSession, not a new check.
   *  Governs whether "My Profile" is offered — /team/[slug]/profile
   *  requires getAccountSession() and must keep doing so; a legacy-only
   *  session clicking "My Profile" would otherwise bounce straight to
   *  /login with no context, a confusing dead end. */
  hasAccountSession?: boolean;
  /** Distinguishes a legacy team_member session (self-serve activation
   *  exists at /team/[slug]/activate-account) from a legacy team_coach
   *  session (activation requires an admin-issued invite token — no
   *  generic self-serve route exists, so no link is offered for coaches). */
  isMember?: boolean;
}) {
  // Account drawer: the menu slides in from the RIGHT edge over a dimmed
  // overlay (it used to be a floating pop-up anchored to this button).
  // `mounted` keeps it in the DOM while it slides out; `shown` drives the
  // slide/fade itself. Portaled to document.body for the same reason the
  // old pop-up was: DesktopSidebar's `position: sticky` creates its own
  // stacking context, which would trap the overlay beneath <main>'s
  // content (see settingsAccess.test.ts).
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const openDrawer = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setReducedMotion(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    setMounted(true);
  };

  // Every close path (overlay tap, X, Escape, Android back, choosing an
  // item) goes through here: slide out, then unmount, and hand focus back
  // to the button that opened the drawer.
  const closeDrawer = useCallback(() => {
    setShown(false);
    buttonRef.current?.focus();
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setMounted(false);
      closeTimer.current = null;
    }, drawerCloseDelayMs(reducedMotion));
  }, [reducedMotion]);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  // Slide in on the frame after mounting (so the off-screen start position
  // is painted first), then move focus to the drawer's close button.
  useEffect(() => {
    if (!mounted) return;
    const frame = requestAnimationFrame(() => {
      setShown(true);
      closeButtonRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [mounted]);

  // Escape closes; Tab / Shift+Tab wrap inside the drawer (accountDrawer.ts).
  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const focusables = panelRef.current
        ? Array.from(panelRef.current.querySelectorAll<HTMLElement>(DRAWER_FOCUSABLE))
        : [];
      const action = drawerKeyAction(e.key, e.shiftKey, focusables.indexOf(document.activeElement as HTMLElement), focusables.length);
      if (!action) return;
      e.preventDefault();
      if (action.type === "close") closeDrawer();
      else focusables[action.index]?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mounted, closeDrawer]);

  // Lets the Android shell's hardware back button close this drawer instead of
  // exiting the app (MainActivity.java checks window.__elfHasOpenOverlay before
  // deciding what back should do). No-op outside the Capacitor Android WebView.
  useEffect(() => {
    if (!mounted) return;
    window.__elfHasOpenOverlay = () => true;
    const handleAndroidBack = () => closeDrawer();
    window.addEventListener("elfAndroidBackButton", handleAndroidBack);
    return () => {
      window.__elfHasOpenOverlay = undefined;
      window.removeEventListener("elfAndroidBackButton", handleAndroidBack);
    };
  }, [mounted, closeDrawer]);

  const initial = initialsOf(accountName);

  const avatar = (size: number) => (
    profilePhotoUrl ? (
      <img src={profilePhotoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    ) : initial ? (
      initial
    ) : (
      <User size={size} aria-hidden="true" />
    )
  );

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        onClick={() => (mounted ? closeDrawer() : openDrawer())}
        aria-label="Account menu"
        aria-haspopup="dialog"
        aria-expanded={mounted}
        className="elf-focus-ring"
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: profilePhotoUrl
            ? "transparent"
            : onDark ? "rgba(255,255,255,.16)" : "var(--surface-light-elevated)",
          border: onDark ? "1.5px solid rgba(255,255,255,.32)" : "1.5px solid var(--border-app)",
          color: onDark ? "#fff" : "var(--text-primary-app)",
          fontWeight: 800,
          fontSize: initial ? ".65rem" : ".9rem",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          letterSpacing: ".01em",
          lineHeight: 1,
          overflow: "hidden",
          padding: 0,
        }}
      >
        {avatar(16)}
      </button>

      {mounted && createPortal(
        <>
          <DrawerScrollLock />
          {/* Dimmed overlay — tapping anywhere outside the drawer closes it. */}
          <div
            onClick={closeDrawer}
            aria-hidden="true"
            style={{ position: "fixed", inset: 0, zIndex: 99, background: "rgba(0,0,0,.4)", pointerEvents: "auto",
              opacity: shown ? 1 : 0, transition: drawerTransition("opacity", reducedMotion) }}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Account menu"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              zIndex: 100,
              width: DRAWER_WIDTH,
              background: "#fff",
              boxShadow: "-8px 0 32px rgba(0,0,0,.22)",
              display: "flex",
              flexDirection: "column",
              paddingTop: "env(safe-area-inset-top, 0px)",
              paddingRight: "env(safe-area-inset-right, 0px)",
              transform: shown ? "translateX(0)" : "translateX(100%)",
              transition: drawerTransition("transform", reducedMotion),
              pointerEvents: "auto",
            }}
          >

            {/* Account identity — the signed-in user's photo and name, with
                the drawer's close button. Stays put while the list scrolls. */}
            <div style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: "1rem 1rem .9rem", borderBottom: "1px solid #f0f0f0", flexShrink: 0 }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
                background: profilePhotoUrl ? "transparent" : "var(--surface-light-elevated)",
                border: "1.5px solid var(--border-app)", color: "var(--text-primary-app)",
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: ".85rem",
              }}>
                {avatar(20)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {accountName && (
                  <>
                    <div style={{ fontWeight: 700, fontSize: ".95rem", color: "var(--text-primary-app)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{accountName}</div>
                    <a
                      href="/teams"
                      onClick={closeDrawer}
                      className="elf-focus-ring"
                      style={{ fontSize: ".75rem", color: "var(--text-muted-app)", textDecoration: "none" }}
                    >
                      My Account →
                    </a>
                  </>
                )}
              </div>
              <button
                ref={closeButtonRef}
                onClick={closeDrawer}
                aria-label="Close account menu"
                className="elf-focus-ring"
                style={{
                  width: 36, height: 36, borderRadius: "50%", background: "#f3f4f6", border: "none",
                  cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center",
                  justifyContent: "center", flexShrink: 0, padding: 0,
                }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Everything between the identity header and Sign Out scrolls,
                so a long team list never pushes Sign Out off-screen. */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>

            {/* Team list */}
            {teams.length > 0 && (
              <div style={{ borderBottom: "1px solid #f0f0f0" }}>
                <div style={{ padding: ".7rem 1rem .3rem", fontSize: ".6rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em" }}>
                  {teams.length > 1 ? "Switch Team" : "Team"}
                </div>
                {teams.map(team => {
                  const isCurrent = team.campaign_slug === currentSlug;
                  // Only shows this team's own color when IT has customized
                  // branding — otherwise every team in the switcher gets
                  // the same ELF-orange dot, consistent with the shell's
                  // own default-theme rule (never infer customization from
                  // the stored color alone).
                  const dotColor = team.branding_customized && team.primary_color
                    ? team.primary_color
                    : "var(--elf-orange)";
                  const subtitle = [team.sport_name, team.season].filter(Boolean).join(" · ");

                  return (
                    <button
                      key={team.campaign_slug}
                      aria-current={isCurrent ? "true" : undefined}
                      onClick={() => {
                        closeDrawer();
                        if (!isCurrent) router.push(`/team/${team.campaign_slug}/home`);
                      }}
                      className="elf-focus-ring"
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: ".7rem",
                        padding: ".7rem 1rem",
                        border: "none",
                        borderLeft: isCurrent ? "3px solid var(--elf-orange)" : "3px solid transparent",
                        borderBottom: "1px solid #f8f8f8",
                        background: isCurrent ? "var(--surface-light-elevated)" : "#fff",
                        cursor: isCurrent ? "default" : "pointer",
                        textAlign: "left",
                      }}
                    >
                      {team.logo_url ? (
                        <img
                          src={team.logo_url}
                          alt=""
                          style={{
                            width: 28, height: 28, borderRadius: "50%", objectFit: "contain",
                            flexShrink: 0, background: "#fff", border: "1px solid var(--border-app)",
                          }}
                        />
                      ) : (
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: dotColor,
                          flexShrink: 0, display: "flex", alignItems: "center",
                          justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: ".68rem",
                        }}>
                          {team.school_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: ".84rem", fontWeight: 700, color: "var(--text-primary-app)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {team.school_name}
                        </div>
                        {subtitle && (
                          <div style={{ fontSize: ".68rem", color: "var(--text-muted-app)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {subtitle}
                          </div>
                        )}
                      </div>
                      {isCurrent && (
                        <span
                          aria-label="Current team"
                          style={{ fontSize: ".68rem", color: "var(--color-success)", fontWeight: 800, flexShrink: 0 }}
                        >
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Create Team (Phase O3) — always offered to an authenticated
                account, with or without existing teams, so a coach can
                start a second team without leaving their current one.
                Uses O2's existing provisioning page; never duplicates the
                dead TeamSwitcher.tsx. Placed right after the team list
                (inside its own row rather than that block, so it still
                renders even when teams.length === 0, matching /teams'
                own zero-team entry point). */}
            <a
              href="/team-onboarding"
              onClick={closeDrawer}
              className="elf-focus-ring"
              style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".8rem 1rem", textDecoration: "none", borderBottom: "1px solid #f0f0f0" }}
            >
              <Plus size={16} aria-hidden="true" style={{ color: "#374151", flexShrink: 0 }} />
              <span style={{ fontSize: ".84rem", fontWeight: 600, color: "#374151" }}>Create Team</span>
            </a>

            {/* Notifications — the label now navigates to the existing
                notifications feed (previously dead on platforms like the
                installed iOS app, where PushOptIn correctly renders
                nothing since WKWebView has no Web Push API). PushOptIn
                stays a sibling button, not nested inside the link — it
                already renders its own <button> and must keep handling
                its own click (toggle subscribe/unsubscribe) without also
                triggering navigation. */}
            <div style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".7rem 1rem", borderBottom: "1px solid #f0f0f0" }}>
              <a
                href={`/team/${currentSlug}/notifications`}
                onClick={closeDrawer}
                className="elf-focus-ring"
                style={{ display: "flex", alignItems: "center", gap: ".65rem", flex: 1, minWidth: 0, textDecoration: "none" }}
              >
                <Bell size={16} aria-hidden="true" style={{ color: "#374151", flexShrink: 0 }} />
                <span style={{ fontSize: ".84rem", fontWeight: 600, color: "#374151" }}>Notifications</span>
              </a>
              <PushOptIn slug={currentSlug} />
            </div>

            {/* My Profile — only offered when a real elf_session exists.
                /team/[slug]/profile requires getAccountSession() and always
                will; a legacy team_coach/team_member-cookie-only session
                clicking this would just bounce to /login with no context.
                Instead show the real supported next step for that session
                type (see hasAccountSession/isMember above). */}
            {hasAccountSession && (
              <a
                href={`/team/${currentSlug}/profile`}
                onClick={closeDrawer}
                className="elf-focus-ring"
                style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".8rem 1rem", textDecoration: "none", borderBottom: "1px solid #f0f0f0" }}
              >
                <User size={16} aria-hidden="true" style={{ color: "#374151", flexShrink: 0 }} />
                <span style={{ fontSize: ".84rem", fontWeight: 600, color: "#374151" }}>My Profile</span>
              </a>
            )}

            {/* My Athletes (Family Relationships Phase D) — same
                hasAccountSession gate as My Profile: this feature is
                entirely account-based (getAccountSession-derived identity),
                so a legacy team_coach/team_member-cookie-only session has
                no account_id to resolve family data with and would only
                dead-end here, same reasoning as My Profile above. Offered
                to every real-account session regardless of coach/member
                role — a Head Coach who is also a parent needs this too. */}
            {hasAccountSession && (
              <a
                href={`/team/${currentSlug}/family`}
                onClick={closeDrawer}
                className="elf-focus-ring"
                style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".8rem 1rem", textDecoration: "none", borderBottom: "1px solid #f0f0f0" }}
              >
                <Users size={16} aria-hidden="true" style={{ color: "#374151", flexShrink: 0 }} />
                <span style={{ fontSize: ".84rem", fontWeight: 600, color: "#374151" }}>My Athletes</span>
              </a>
            )}
            {!hasAccountSession && isMember && (
              // Legacy team_member session: self-serve activation genuinely
              // exists and is safe to link to (verifies via the member's own
              // team_member cookie, on-file-email-only linking — see
              // members/activate/route.ts).
              <a
                href={`/team/${currentSlug}/activate-account`}
                onClick={closeDrawer}
                className="elf-focus-ring"
                style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".8rem 1rem", textDecoration: "none", borderBottom: "1px solid #f0f0f0" }}
              >
                <User size={16} aria-hidden="true" style={{ color: "#374151", flexShrink: 0 }} />
                <span style={{ fontSize: ".84rem", fontWeight: 600, color: "#374151" }}>Activate ELF Account</span>
              </a>
            )}
            {!hasAccountSession && !isMember && (
              // Legacy team_coach session: no generic self-serve activation
              // exists (requires an admin-issued single-use invite token) —
              // showing a fake/broken link here would be worse than no link.
              // Informational only, not clickable, so it can't dead-end.
              <div
                style={{ display: "flex", alignItems: "flex-start", gap: ".65rem", padding: ".8rem 1rem", borderBottom: "1px solid #f0f0f0" }}
              >
                <User size={16} aria-hidden="true" style={{ color: "#374151", flexShrink: 0 }} />
                <span style={{ fontSize: ".78rem", color: "#9ca3af", lineHeight: 1.45 }}>
                  Set up your ELF account to manage your profile and access multiple teams. Ask your administrator for an activation link.
                </span>
              </div>
            )}

            {/* Settings */}
            <a
              href={`/team/${currentSlug}/settings`}
              onClick={closeDrawer}
              className="elf-focus-ring"
              style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".8rem 1rem", textDecoration: "none", borderBottom: "1px solid #f0f0f0" }}
            >
              <SettingsIcon size={16} aria-hidden="true" style={{ color: "#374151", flexShrink: 0 }} />
              <span style={{ fontSize: ".84rem", fontWeight: 600, color: "#374151" }}>Settings</span>
            </a>

            {/* Support & Legal (Apple Guideline 1.2 / 2.1) — reachable from
                inside the authenticated app for every role, not just on the
                public marketing site. Links point at the existing canonical
                marketing-site pages rather than duplicating their content
                in-app. */}
            <div style={{ padding: ".7rem 1rem .15rem", fontSize: ".6rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em" }}>
              Support &amp; Legal
            </div>
            <div style={{ paddingBottom: ".4rem" }}>
              {[
                { href: "/contact",            label: "Support / Contact" },
                { href: "/trust/privacy",       label: "Privacy Policy" },
                { href: "/legal/terms",         label: "Terms of Service" },
                { href: "/legal/acceptable-use", label: "Acceptable Use Policy" },
              ].map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={closeDrawer}
                  className="elf-focus-ring"
                  style={{ display: "block", padding: ".55rem 1rem", fontSize: ".78rem", color: "#6b7280", textDecoration: "none" }}
                >
                  {link.label}
                </a>
              ))}
            </div>
            </div>

            {/* Sign Out — pinned to the bottom of the drawer (outside the
                scrolling list, above the home indicator). Plain browser/PWA
                form POST is left completely unchanged; in the installed
                iOS/Android apps only, this is intercepted to route through
                the native-aware logout helper so this device's own APNs
                token gets deactivated too (see nativePushDevice.ts). */}
            <form
              method="POST"
              action="/api/auth/logout"
              onSubmit={e => {
                if (!isNativeApp()) return;
                e.preventDefault();
                void performNativeAwareLogout(router);
              }}
              style={{ flexShrink: 0, borderTop: "1px solid #f0f0f0", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            >
              <button
                type="submit"
                className="elf-focus-ring"
                style={{ width: "100%", display: "flex", alignItems: "center", gap: ".65rem", padding: ".9rem 1rem", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
              >
                <LogOut size={16} aria-hidden="true" style={{ color: "#9ca3af", flexShrink: 0 }} />
                <span style={{ fontSize: ".84rem", fontWeight: 600, color: "#9ca3af" }}>Sign Out</span>
              </button>
            </form>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
