"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, User } from "lucide-react";
import type { TeamSummary } from "@/lib/accountSession";
import { isNativeIosApp, performNativeAwareLogout } from "@/lib/nativePushDevice";
import { resolveTeamTheme } from "@/lib/theme/teamTheme";

export default function TeamSwitcher({
  currentSlug,
  teams,
}: {
  currentSlug: string;
  teams: TeamSummary[];
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router          = useRouter();

  // Hide only when no account teams at all (not logged in via elf_session)
  if (teams.length === 0) return null;

  const canSwitch = teams.length > 1;

  function switchTo(slug: string) {
    setOpen(false);
    router.push(`/team/${slug}/home`);
  }

  // Same fix as AccountMenu.tsx: this dropdown (backdrop + panel) used to
  // render inline, nested under TeamHeader/DesktopSidebar.
  // DesktopSidebar's `position: sticky` unconditionally creates its own
  // stacking context regardless of z-index, which trapped the backdrop's
  // zIndex:99 inside it — since <main>'s page content is a LATER sibling
  // of DesktopSidebar at the root stacking level, it painted on top of
  // DesktopSidebar's entire subtree, backdrop included, which is why
  // underlying cards/inputs/buttons visually "punched through" the
  // dimming instead of being covered by it. Portaling to document.body
  // puts the backdrop at the true root stacking level. The panel's old
  // `position: absolute` anchor to this button breaks once portaled, so
  // its position is computed from the button's real screen coordinates
  // instead, captured when the menu opens.
  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setOpen(true);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label={canSwitch ? "Switch team" : "Account menu"}
        aria-expanded={open}
        style={{
          background: "rgba(255,255,255,.18)",
          border: "1.5px solid rgba(255,255,255,.32)",
          color: "#fff",
          borderRadius: ".4rem",
          padding: ".3rem .55rem",
          fontSize: ".75rem",
          fontWeight: 700,
          cursor: "pointer",
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          gap: ".25rem",
        }}
      >
        {canSwitch ? (
          <>
            <ArrowLeftRight size={13} strokeWidth={2} aria-hidden="true" /> Switch
          </>
        ) : (
          <User size={13} strokeWidth={2} aria-hidden="true" />
        )}
      </button>

      {open && menuPos && createPortal(
        <>
          {/* Backdrop — full viewport, explicitly interactive (see
              AccountMenu.tsx's identical comment for why pointerEvents
              must be explicit once portaled). */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 99, background: "rgba(0,0,0,.4)", pointerEvents: "auto" }}
          />

          {/* Dropdown panel — fixed + computed coordinates, not
              absolute + calc(), since portaling to document.body breaks
              the old anchor to this button. */}
          <div style={{
            position: "fixed",
            top: menuPos.top,
            right: menuPos.right,
            zIndex: 100,
            background: "#fff",
            borderRadius: ".75rem",
            boxShadow: "0 8px 32px rgba(0,0,0,.22)",
            minWidth: 210,
            overflow: "hidden",
            pointerEvents: "auto",
          }}>
            <div style={{ padding: ".6rem 1rem", fontSize: ".72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em", borderBottom: "1px solid #f0f0f0" }}>
              Your Teams
            </div>

            {teams.map(team => {
              const isCurrent = team.campaign_slug === currentSlug;
              // Each row shows ITS OWN team's accent, not the currently
              // active team's var(--team-primary) (that CSS variable only
              // reflects whichever team is active in this layout render).
              // resolveTeamTheme() applies the same branding_customized
              // fallback rule used everywhere else in the app: an
              // uncustomized team always gets the ELF default color,
              // regardless of whatever raw value happens to be stored.
              const rowTheme = resolveTeamTheme(team.primary_color, null, team.branding_customized);
              return (
                <button
                  key={team.campaign_slug}
                  onClick={() => !isCurrent && switchTo(team.campaign_slug)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: ".75rem",
                    padding: ".8rem 1rem",
                    border: "none",
                    borderBottom: "1px solid #f5f5f5",
                    background: isCurrent ? "#f5f6f8" : "#fff",
                    cursor: isCurrent ? "default" : "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: rowTheme["--team-primary"],
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: rowTheme["--team-primary-foreground"],
                    fontWeight: 800,
                    fontSize: ".75rem",
                  }}>
                    {team.school_name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: ".88rem", fontWeight: 700, color: "var(--text-primary-app)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {team.school_name}
                    </div>
                    <div style={{ fontSize: ".72rem", color: "#6b7280" }}>{team.sport_name}</div>
                  </div>
                  {isCurrent && (
                    <span style={{ fontSize: ".72rem", color: "#22c55e", fontWeight: 800 }}>✓</span>
                  )}
                </button>
              );
            })}

            <a
              href="/teams"
              onClick={() => setOpen(false)}
              style={{ display: "block", padding: ".75rem 1rem", fontSize: ".82rem", color: "var(--text-primary-app)", fontWeight: 600, textDecoration: "none", textAlign: "center", borderTop: "1px solid #f0f0f0" }}
            >
              All Teams
            </a>
            <form
              method="POST"
              action="/api/auth/logout"
              style={{ borderTop: "1px solid #f0f0f0" }}
              onSubmit={e => {
                if (!isNativeIosApp()) return;
                e.preventDefault();
                void performNativeAwareLogout(router);
              }}
            >
              <button
                type="submit"
                style={{ width: "100%", padding: ".75rem 1rem", background: "none", border: "none", fontSize: ".82rem", color: "#9ca3af", cursor: "pointer", textAlign: "center" }}
              >
                Sign Out
              </button>
            </form>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
