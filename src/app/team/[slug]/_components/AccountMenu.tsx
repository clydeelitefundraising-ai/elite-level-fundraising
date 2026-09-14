"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, User, Settings as SettingsIcon, LogOut } from "lucide-react";
import type { TeamSummary } from "@/lib/accountSession";
import PushOptIn from "./PushOptIn";
import { isNativeIosApp, performNativeAwareLogout } from "@/lib/nativePushDevice";

declare global {
  interface Window {
    __elfHasOpenOverlay?: () => boolean;
  }
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
   *  — everything else (the dropdown panel itself) is always white
   *  regardless of onDark, since it's an overlay, not part of either
   *  shell surface. */
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
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  // QA fix: the dropdown (backdrop + panel) used to render inline here,
  // nested under TeamHeader/DesktopSidebar — DesktopSidebar's
  // `position: sticky` unconditionally creates its own stacking context
  // regardless of z-index, which trapped the backdrop's zIndex:99 inside
  // it. Since <main>'s page content is a LATER sibling of DesktopSidebar
  // at the ROOT stacking level (both at the implicit z-index:auto="0"
  // level), it painted ON TOP of DesktopSidebar's entire subtree —
  // including the backdrop — which is exactly why comment inputs/Post
  // buttons/cards "punched through" the dimming instead of being
  // covered by it. Portaling straight to document.body (same fix as the
  // four modals) puts the backdrop at the true root stacking level,
  // where its zIndex:99 is compared against the whole page, not just
  // DesktopSidebar's local context.
  //
  // The panel itself used `position: absolute` anchored to this
  // wrapper — portaling breaks that anchor (its new closest positioned
  // ancestor becomes document.body), so its position is now computed
  // from the toggle button's own screen position instead, captured once
  // when the menu opens.
  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setOpen(true);
  };

  // Lets the Android shell's hardware back button close this dropdown instead of
  // exiting the app (MainActivity.java checks window.__elfHasOpenOverlay before
  // deciding what back should do). No-op outside the Capacitor Android WebView.
  useEffect(() => {
    if (!open) return;
    window.__elfHasOpenOverlay = () => true;
    const handleAndroidBack = () => setOpen(false);
    window.addEventListener("elfAndroidBackButton", handleAndroidBack);
    return () => {
      window.__elfHasOpenOverlay = undefined;
      window.removeEventListener("elfAndroidBackButton", handleAndroidBack);
    };
  }, [open]);

  const initial = accountName
    ? accountName.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("")
    : null;

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label="Account menu"
        aria-expanded={open}
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
        {profilePhotoUrl ? (
          <img src={profilePhotoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : initial ? (
          initial
        ) : (
          <User size={16} aria-hidden="true" />
        )}
      </button>

      {open && menuPos && createPortal(
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 99, background: "rgba(0,0,0,.4)", pointerEvents: "auto" }}
          />
          <div style={{
            position: "fixed",
            top: menuPos.top,
            right: menuPos.right,
            zIndex: 100,
            background: "#fff",
            borderRadius: ".85rem",
            boxShadow: "0 8px 32px rgba(0,0,0,.22)",
            minWidth: 230,
            overflow: "hidden",
            pointerEvents: "auto",
          }}>

            {/* Account identity */}
            {accountName && (
              <div style={{ padding: ".85rem 1rem .7rem", borderBottom: "1px solid #f0f0f0" }}>
                <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-primary-app)" }}>{accountName}</div>
                <a
                  href="/teams"
                  onClick={() => setOpen(false)}
                  className="elf-focus-ring"
                  style={{ fontSize: ".72rem", color: "var(--text-muted-app)", textDecoration: "none" }}
                >
                  My Account →
                </a>
              </div>
            )}

            {/* Team list */}
            {teams.length > 0 && (
              <div style={{ borderBottom: "1px solid #f0f0f0" }}>
                <div style={{ padding: ".55rem 1rem .3rem", fontSize: ".6rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em" }}>
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
                      onClick={() => {
                        setOpen(false);
                        if (!isCurrent) router.push(`/team/${team.campaign_slug}/home`);
                      }}
                      className="elf-focus-ring"
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: ".7rem",
                        padding: ".65rem 1rem",
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

            {/* Notifications — the label now navigates to the existing
                notifications feed (previously dead on platforms like the
                installed iOS app, where PushOptIn correctly renders
                nothing since WKWebView has no Web Push API). PushOptIn
                stays a sibling button, not nested inside the link — it
                already renders its own <button> and must keep handling
                its own click (toggle subscribe/unsubscribe) without also
                triggering navigation. */}
            <div style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".65rem 1rem", borderBottom: "1px solid #f0f0f0" }}>
              <a
                href={`/team/${currentSlug}/notifications`}
                onClick={() => setOpen(false)}
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
                onClick={() => setOpen(false)}
                className="elf-focus-ring"
                style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".7rem 1rem", textDecoration: "none", borderBottom: "1px solid #f0f0f0" }}
              >
                <User size={16} aria-hidden="true" style={{ color: "#374151", flexShrink: 0 }} />
                <span style={{ fontSize: ".84rem", fontWeight: 600, color: "#374151" }}>My Profile</span>
              </a>
            )}
            {!hasAccountSession && isMember && (
              // Legacy team_member session: self-serve activation genuinely
              // exists and is safe to link to (verifies via the member's own
              // team_member cookie, on-file-email-only linking — see
              // members/activate/route.ts).
              <a
                href={`/team/${currentSlug}/activate-account`}
                onClick={() => setOpen(false)}
                className="elf-focus-ring"
                style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".7rem 1rem", textDecoration: "none", borderBottom: "1px solid #f0f0f0" }}
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
                style={{ display: "flex", alignItems: "flex-start", gap: ".65rem", padding: ".7rem 1rem", borderBottom: "1px solid #f0f0f0" }}
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
              onClick={() => setOpen(false)}
              className="elf-focus-ring"
              style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".7rem 1rem", textDecoration: "none", borderBottom: "1px solid #f0f0f0" }}
            >
              <SettingsIcon size={16} aria-hidden="true" style={{ color: "#374151", flexShrink: 0 }} />
              <span style={{ fontSize: ".84rem", fontWeight: 600, color: "#374151" }}>Settings</span>
            </a>

            {/* Support & Legal (Apple Guideline 1.2 / 2.1) — reachable from
                inside the authenticated app for every role, not just on the
                public marketing site. Links point at the existing canonical
                marketing-site pages rather than duplicating their content
                in-app. */}
            <div style={{ padding: ".5rem 1rem .15rem", fontSize: ".6rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em", borderBottom: "1px solid #f0f0f0", paddingBottom: ".15rem" }}>
              Support &amp; Legal
            </div>
            <div style={{ borderBottom: "1px solid #f0f0f0" }}>
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
                  onClick={() => setOpen(false)}
                  className="elf-focus-ring"
                  style={{ display: "block", padding: ".5rem 1rem", fontSize: ".78rem", color: "#6b7280", textDecoration: "none" }}
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Sign Out — plain browser/PWA form POST is left completely
                unchanged; on the installed iOS app only, this is
                intercepted to route through the native-aware logout
                helper so this device's own APNs token gets deactivated
                too (see nativePushDevice.ts). */}
            <form
              method="POST"
              action="/api/auth/logout"
              onSubmit={e => {
                if (!isNativeIosApp()) return;
                e.preventDefault();
                void performNativeAwareLogout(router);
              }}
            >
              <button
                type="submit"
                className="elf-focus-ring"
                style={{ width: "100%", display: "flex", alignItems: "center", gap: ".65rem", padding: ".7rem 1rem", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
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
