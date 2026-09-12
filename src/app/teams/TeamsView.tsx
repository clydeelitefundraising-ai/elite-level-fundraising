"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { TeamSummary } from "@/lib/accountSession";
import { teamRoleLabel } from "@/lib/permissions";
import { isNativeIosApp, performNativeAwareLogout } from "@/lib/nativePushDevice";
import { authDisplayFont, authHandFont } from "@/components/auth/authDisplayFont";
import type { EntryPhoto } from "@/components/auth/entryPhotos";
import entryStyles from "@/components/auth/authEntry.module.css";
import styles from "./Teams.module.css";

export type PendingTeamCard = {
  campaign_slug:  string;
  school_name:    string;
  sport_name:     string;
  status:         "pending" | "declined";
  created_at:     string;
  decline_reason: string | null;
  // e.g. "Requesting access as parent of Abigail Cooper" — set only for
  // parent access requests, distinguishing them from athlete
  // self-registration requests, which have no note.
  note?:          string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(11, 30, 61, ${alpha})`;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const ROLE_ICON: Record<string, string> = {
  athlete:         "🏃",
  head_coach:      "🏅",
  assistant_coach: "📋",
  parent:          "👪",
  booster:         "🤝",
};

// ── Profile menu ──────────────────────────────────────────────────────────────

function ProfileMenu({ accountName, firstTeamSlug }: { accountName: string; firstTeamSlug: string | null }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const initial = accountName.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Profile menu"
        aria-expanded={open}
        style={{
          width: 34, height: 34, borderRadius: "50%",
          background: "rgba(255,255,255,.15)", border: "1.5px solid rgba(255,255,255,.3)",
          color: "#fff", fontWeight: 800, fontSize: ".68rem", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {initial}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99, background: "rgba(0,0,0,.35)" }} />
          <div style={{
            position: "absolute", top: "calc(100% + .5rem)", right: 0, zIndex: 100,
            background: "#fff", borderRadius: ".85rem", boxShadow: "0 10px 34px rgba(0,0,0,.25)",
            minWidth: 200, overflow: "hidden",
          }}>
            <div style={{ padding: ".8rem 1rem .6rem", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ fontWeight: 700, fontSize: ".88rem", color: "#121110" }}>{accountName}</div>
            </div>

            {firstTeamSlug && (
              <a href={`/team/${firstTeamSlug}/profile`} onClick={() => setOpen(false)} style={menuItemStyle}>
                <span style={{ fontSize: ".9rem" }}>👤</span> My Profile
              </a>
            )}
            {firstTeamSlug && (
              <a href={`/team/${firstTeamSlug}/settings`} onClick={() => setOpen(false)} style={menuItemStyle}>
                <span style={{ fontSize: ".9rem" }}>⚙️</span> Settings
              </a>
            )}
            <a href="mailto:support@elitelevelfundraising.com" style={menuItemStyle}>
              <span style={{ fontSize: ".9rem" }}>❓</span> Help
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
              <button type="submit" style={{ ...menuItemStyle, width: "100%", border: "none", background: "none", cursor: "pointer", textAlign: "left", color: "#9ca3af" }}>
                <span style={{ fontSize: ".9rem" }}>↩</span> Sign Out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: ".65rem",
  padding: ".7rem 1rem", fontSize: ".84rem", fontWeight: 600, color: "#374151",
  textDecoration: "none", borderBottom: "1px solid #f8f8f8",
};

// ── Page ──────────────────────────────────────────────────────────────────────

// Pending/declined athlete-request card — deliberately not an <a>, no
// "Enter Team" action. This is the visible state a pending/declined user
// sees instead of team access, per Phase 1B.
function PendingCard({ card }: { card: PendingTeamCard }) {
  const isDeclined = card.status === "declined";
  return (
    <div
      style={{
        borderRadius: "1.1rem",
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 3px 12px 0 rgba(11,30,61,.1)",
        border: `1.5px dashed ${isDeclined ? "#fca5a5" : "#d1d5db"}`,
      }}
    >
      <div style={{ padding: "1.1rem 1.25rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        <div style={{
          width: 56, height: 56, borderRadius: "1rem", flexShrink: 0,
          background: isDeclined ? "#fef2f2" : "#eef1f6",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem",
        }}>
          {isDeclined ? "🚫" : "⏳"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1.02rem", color: "#121110", lineHeight: 1.25 }}>
            {card.school_name}
          </div>
          <div style={{ fontSize: ".8rem", color: "#6b7280", marginTop: ".25rem" }}>
            {card.sport_name}
          </div>
          {card.note && (
            <div style={{ fontSize: ".76rem", color: "#374151", marginTop: ".3rem", lineHeight: 1.4 }}>
              {card.note}
            </div>
          )}
          <span style={{
            display: "inline-flex", alignItems: "center", marginTop: ".5rem",
            background: isDeclined ? "#fef2f2" : "#fffbeb",
            color: isDeclined ? "#b91c1c" : "#92400e",
            borderRadius: 100, fontSize: ".65rem", fontWeight: 700,
            padding: ".25rem .6rem", textTransform: "uppercase", letterSpacing: ".03em",
          }}>
            {isDeclined ? "Request Declined" : "Pending Approval"}
          </span>
          {isDeclined && card.decline_reason && (
            <div style={{ fontSize: ".76rem", color: "#9ca3af", marginTop: ".4rem", lineHeight: 1.4 }}>
              {card.decline_reason}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TeamsView({
  teams,
  pendingCards,
  accountName,
  photo,
}: {
  teams: TeamSummary[];
  pendingCards: PendingTeamCard[];
  accountName: string;
  photo: EntryPhoto;
}) {
  return (
    <div className={`${styles.page} ${authDisplayFont.variable} ${authHandFont.variable}`} style={{ background: "var(--shell-backdrop)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        .team-card { transition: transform .15s ease, box-shadow .15s ease; }
        .team-card:hover { transform: translateY(-2px); box-shadow: var(--card-shadow-hover); }
        .team-card:active { transform: scale(.985); box-shadow: var(--card-shadow); }
      `}</style>
      <div className={styles.panel} style={{ background: "#f5f6f8" }}>

        {/* Phase A36 mobile refinement — compact photo hero, hidden at
            1024px+ where the dark crown+text header (below) takes over. */}
        <div className={entryStyles.mobileHero}>
          <div className={entryStyles.photoFill}>
            <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 1023px) 100vw, 0px" priority />
          </div>
          <div className={entryStyles.photoScrim} />
          {/* Mobile Sign Out — the desktop .header below already has this
              via ProfileMenu, but .mobileHero (hidden at >=1024px by its
              own existing CSS) has no account affordance at all, leaving a
              pending/no-team user on mobile with no way to sign out. Same
              ProfileMenu component, reused as-is, just also mounted here —
              its own display:none at desktop widths comes for free from
              .mobileHero's existing breakpoint, so no CSS changes needed. */}
          <div style={{ position: "absolute", top: "1rem", right: "1rem", zIndex: 3 }}>
            <ProfileMenu accountName={accountName} firstTeamSlug={teams[0]?.campaign_slug ?? null} />
          </div>
          <div className={entryStyles.mobileHeroContent}>
            <Image
              src="/auth/elf-team-logo.png"
              alt="ELF Team"
              width={1536}
              height={1024}
              className={entryStyles.mobileHeroLogo}
              priority
            />
          </div>
        </div>

        {/* Header — desktop-only (see Teams.module.css .header) */}
        <div className={styles.header} style={{ background: "var(--shell-backdrop)", padding: "1.1rem 1rem .9rem", alignItems: "center", gap: ".875rem" }}>
          <Image
            src="/auth/elf-team-logo.png"
            alt="ELF Team"
            width={1536}
            height={1024}
            className={entryStyles.brandMarkCompact}
            style={{ flexShrink: 0 }}
            priority
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: ".95rem", lineHeight: 1.2 }}>Choose Your Team</div>
            <div style={{ color: "rgba(255,255,255,.55)", fontSize: ".72rem", marginTop: ".05rem" }}>Select the team you want to enter</div>
          </div>
          <ProfileMenu accountName={accountName} firstTeamSlug={teams[0]?.campaign_slug ?? null} />
        </div>
        <div style={{ height: 3, background: "var(--elf-orange)" }} />

        {/* Welcome blurb */}
        <div style={{ padding: "1.25rem 1.25rem .75rem" }}>
          <div style={{ fontFamily: "var(--auth-font-display, inherit)", fontWeight: 400, fontSize: "1.35rem", color: "#121110", letterSpacing: ".01em" }}>
            Welcome back, {accountName.split(" ")[0]}
          </div>
          <div style={{ fontSize: ".82rem", color: "#6b7280", marginTop: ".2rem" }}>
            {teams.length === 0 && pendingCards.length === 0
              ? "You're not on any teams yet."
              : teams.length === 1 && pendingCards.length === 0
              ? "Your team is ready."
              : teams.length > 0
              ? `You're on ${teams.length} team${teams.length !== 1 ? "s" : ""}.`
              : "You have a pending request."}
          </div>
        </div>

        {/* Team cards */}
        <div className={styles.contentColumn}>
          {pendingCards.map(card => (
            <PendingCard key={`${card.campaign_slug}-${card.status}`} card={card} />
          ))}

          {teams.length === 0 && pendingCards.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 0" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: ".75rem" }}>🏫</div>
              <p style={{ color: "#6b7280", margin: "0 0 1.25rem", fontSize: ".9rem", lineHeight: 1.5 }}>
                No teams linked yet.
              </p>
              <a
                href="/enter-code"
                style={{ display: "inline-block", background: "var(--elf-orange)", color: "#fff", padding: ".85rem 1.75rem", borderRadius: ".85rem", textDecoration: "none", fontWeight: 700, fontSize: ".95rem" }}
              >
                Enter Team Code
              </a>
            </div>
          ) : (
            <div className={styles.teamsGrid}>
            {teams.map(team => {
              const color = team.primary_color || "#121110";
              const cardShadow      = `0 3px 12px 0 ${hexToRgba(color, 0.16)}`;
              const cardShadowHover = `0 10px 28px 0 ${hexToRgba(color, 0.3)}`;
              return (
                <a
                  key={team.campaign_slug}
                  href={`/team/${team.campaign_slug}/home`}
                  className="team-card"
                  style={{
                    display: "block", textDecoration: "none", borderRadius: "1.1rem", overflow: "hidden",
                    background: "#fff",
                    boxShadow: cardShadow,
                    "--card-shadow": cardShadow,
                    "--card-shadow-hover": cardShadowHover,
                  } as React.CSSProperties}
                >
                  {/* Team-color accent stripe */}
                  <div style={{ height: 6, background: `linear-gradient(90deg, ${color}, ${hexToRgba(color, 0.6)})` }} />

                  <div style={{ padding: "1.15rem 1.25rem", display: "flex", alignItems: "center", gap: "1rem" }}>
                    {/* Team logo — full, uncropped, generously padded */}
                    <div style={{
                      width: 64, height: 64, borderRadius: "1rem", flexShrink: 0,
                      background: team.logo_url ? "#f5f6f8" : color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: `0 3px 10px ${hexToRgba(color, 0.35)}`,
                      padding: team.logo_url ? 8 : 0,
                      boxSizing: "border-box",
                    }}>
                      {team.logo_url ? (
                        <img
                          src={team.logo_url}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "contain" }}
                        />
                      ) : (
                        <span style={{ color: "#fff", fontWeight: 800, fontSize: "1.4rem" }}>
                          {team.school_name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Team identity */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 800, fontSize: "1.05rem", color: "#121110", lineHeight: 1.25,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {team.school_name}
                      </div>
                      <div style={{ fontSize: ".8rem", color: "#6b7280", marginTop: ".32rem" }}>
                        {[team.mascot, team.sport_name].filter(Boolean).join(" · ") || "Team Hub"}
                        {team.season && ` · ${team.season}`}
                      </div>
                      {team.role && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: ".3rem",
                          marginTop: ".55rem", background: hexToRgba(color, 0.1), color,
                          borderRadius: 100, fontSize: ".65rem", fontWeight: 700,
                          padding: ".25rem .6rem .25rem .5rem", textTransform: "uppercase", letterSpacing: ".03em",
                        }}>
                          <span style={{ fontSize: ".75rem" }}>{ROLE_ICON[team.role] ?? "⭐"}</span>
                          {teamRoleLabel(team.role, team.role_kind)}
                        </span>
                      )}
                    </div>

                    {/* Chevron — the entire card is the tap target */}
                    <span style={{ flexShrink: 0, fontSize: "1.4rem", fontWeight: 800, color: hexToRgba(color, 0.55) }}>
                      ›
                    </span>
                  </div>
                </a>
              );
            })}
            </div>
          )}

          {(teams.length > 0 || pendingCards.length > 0) && (
            <a
              href="/enter-code"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: ".4rem",
                marginTop: ".1rem", padding: ".75rem",
                border: "1.5px dashed #DE4712", borderRadius: "1rem",
                fontSize: ".85rem", color: "#DE4712", fontWeight: 700, textDecoration: "none",
              }}
            >
              + Add Team
            </a>
          )}

          {/* Informational footer — replaces empty whitespace below the cards */}
          {(teams.length > 0 || pendingCards.length > 0) && (
            <div style={{
              display: "flex", gap: ".7rem", alignItems: "flex-start",
              margin: ".25rem 0 1.5rem", padding: "1rem 1.1rem",
              background: "#F5F0E6", borderRadius: "1rem",
            }}>
              <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>💡</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: ".84rem", color: "#121110", marginBottom: ".2rem" }}>
                  Need another team?
                </div>
                <div style={{ fontSize: ".78rem", color: "#6b7280", lineHeight: 1.5 }}>
                  Use your coach&apos;s team code to connect another athlete, parent, booster, or coach account.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Phase A36 — desktop-only editorial photo band beneath the team
            cards, per the reference's "Choose Your Team" composition. Hidden
            below 1024px (Teams.module.css) — mobile stays exactly as before. */}
        <div className={styles.photoBand}>
          <div className={entryStyles.photoFill}>
            <Image src={photo.src} alt={photo.alt} fill sizes="760px" priority />
          </div>
          <div className={entryStyles.photoScrim} />
          <div className={entryStyles.photoContent} style={{ padding: "0 1.75rem 1.25rem" }}>
            <p className={entryStyles.handwritten} style={{ fontSize: "1.05rem", margin: 0 }}>
              Good people. Great teams.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
