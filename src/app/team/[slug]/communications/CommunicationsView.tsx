"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Megaphone, MessageCircle } from "lucide-react";
import type { AnnouncementRow, TeamFileRow } from "@/lib/teamData";
import { isHeadCoach, isCoachOnlyRole, type TeamActor } from "@/lib/permissions";
import type { ThreadWithDetails } from "@/lib/messages";
import UpdatesWorkspaceView from "../files/UpdatesWorkspaceView";
import MessagesView from "../messages/MessagesView";
import styles from "./Communications.module.css";

type Section = "updates" | "messages";

const SEG: Array<{ id: Section; icon: typeof Megaphone; label: string }> = [
  { id: "updates",  icon: Megaphone,     label: "Updates" },
  { id: "messages", icon: MessageCircle, label: "Messages" },
];

export default function CommunicationsView({
  slug,
  initialUpdates,
  initialFiles,
  actor,
  athletes,
  initialThreads,
  actorKind,
  actorId,
  actorName,
  isStaff,
  primaryColor,
  seasonReadOnly = false,
}: {
  slug: string;
  initialUpdates: AnnouncementRow[];
  initialFiles: TeamFileRow[];
  actor: TeamActor;
  athletes: { id: string; name: string }[];
  initialThreads: ThreadWithDetails[];
  actorKind: "coach" | "member" | "platform_admin" | null;
  actorId: string | null;
  actorName: string | null;
  isStaff: boolean;
  primaryColor: string;
  // Complete Season: this team's season is completed (read-only).
  seasonReadOnly?: boolean;
}) {
  const searchParams = useSearchParams();
  const initialSection: Section = searchParams.get("tab") === "messages" ? "messages" : "updates";
  const [section, setSection] = useState<Section>(initialSection);

  // Seeded from the same thread data fetched server-side for this page,
  // then kept live by MessagesView's onUnreadChange callback — MessagesView
  // already refetches threads on elf:messages-changed (thread read, new
  // thread created), so this derives from that same data instead of
  // issuing its own redundant fetch.
  const [dmUnreadCount, setDmUnreadCount] = useState(
    initialThreads.reduce((sum, t) => sum + t.unread_count, 0),
  );

  // Centred segmented control, same treatment as the Partners selector
  // (sponsors/PartnersView.tsx): spans the content width up to 440px, the
  // two tabs split it evenly, and the font steps down on narrow phones
  // (never below 12px) so icon + label + unread badge stay on one line
  // from 320px up. The active tab is the white pill, with its icon in the
  // team accent colour.
  // Section state/switching logic is unchanged.
  const tabNav = (
    <div
      role="tablist"
      aria-label="Communications section"
      style={{
        display: "flex", width: "100%", maxWidth: 440, boxSizing: "border-box",
        margin: "0 auto .85rem", background: "#f3f4f6", borderRadius: 10, padding: 3, gap: 3,
      }}
    >
      {SEG.map(({ id, label, icon: Icon }) => {
        const active = section === id;
        const unread = id === "messages" ? dmUnreadCount : 0;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => setSection(id)}
            className="elf-focus-ring"
            style={{
              flex: "1 1 0",
              minWidth: 0,
              minHeight: 40,
              padding: ".45rem .35rem",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: "clamp(.75rem, 3.5vw, .875rem)",
              fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: ".4rem",
              whiteSpace: "nowrap",
              background: active ? "#fff" : "transparent",
              color: active ? "#111827" : "#6b7280",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,.1)" : "none",
            }}
          >
            <Icon size={15} aria-hidden="true" style={{ flexShrink: 0, color: active ? "var(--team-primary)" : "currentColor" }} />
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
            {unread > 0 && (
              <span style={{
                flexShrink: 0,
                background: "var(--color-error)",
                color: "#fff",
                borderRadius: "var(--radius-full)",
                fontSize: ".62rem",
                fontWeight: 700,
                padding: ".05rem .38rem",
                minWidth: 15,
                textAlign: "center",
                lineHeight: 1.4,
              }}>
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: ".7rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Team Hub
        </span>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em", lineHeight: 1.2 }}>
          Communications
        </h2>
      </div>

      {/* ── Section nav — same segmented control at every width.
          The coach-desktop/member-desktop Updates presentation split is
          entirely UpdatesWorkspaceView's responsibility (via
          shouldShowDesktopCommunications there), not this component's. ── */}
      {tabNav}

      {/* ── Section 1: Team Updates ── */}
      {section === "updates" && (
        <UpdatesWorkspaceView
          slug={slug}
          initialUpdates={initialUpdates}
          initialFiles={initialFiles}
          actor={actor}
          athletes={athletes}
        />
      )}

      {/* ── Section 2: Direct Messages ──
          messagesWrapDesktop (Phase 6 refinement): MessagesView previously
          had no width constraint at all, so it stretched full-bleed at
          desktop like a phone list enlarged rather than a real workspace.
          Same 760px reading-width treatment as Updates' memberUpdatesDesktop
          — applied unconditionally here since MessagesView already renders
          identically for every role (no coach/member split to preserve).
          Pure CSS wrapper only; no routing/realtime/polling touched. */}
      {section === "messages" && (
        <div className={styles.messagesWrapDesktop}>
        {actorKind === null ? (
          <div style={{
            background: "var(--surface-light)", borderRadius: "var(--radius-md)", padding: "3rem 1.5rem",
            textAlign: "center", border: "1px solid var(--border-app)",
          }}>
            <MessageCircle size={28} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-muted-app)", opacity: .5, marginBottom: ".65rem" }} />
            <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-primary-app)", marginBottom: ".3rem" }}>
              Sign in to view messages
            </div>
            <div style={{ fontSize: ".8rem", color: "var(--text-muted-app)" }}>
              Messages are private to team members and coaches.
            </div>
          </div>
        ) : (
          <MessagesView
            slug={slug}
            initialThreads={initialThreads}
            // MessagesView's self-participant filtering only knows
            // "coach"|"member" — a platform admin isn't a participant in
            // any existing thread, so this coercion is display-only and
            // changes nothing observable (no threads to mis-filter yet).
            actorKind={actorKind === "platform_admin" ? "coach" : actorKind}
            actorId={actorId!}
            actorName={actorName!}
            isStaff={isStaff}
            isHeadCoach={isHeadCoach(actor)}
            // Group Messaging G2 — exactly the G1 server's own creation
            // rule (team_coaches role head_coach/assistant_coach only),
            // computed from the real TeamActor rather than isStaff/
            // isHeadCoach, which both admit booster/platform_admin in ways
            // the G1 endpoint explicitly does not. permissions.ts is
            // client-safe (no server-only imports), so this is computed
            // directly here rather than threaded down as a second new prop
            // from the server page.
            canCreateGroup={actor.kind === "coach" && isCoachOnlyRole(actor.session.role)}
            primaryColor={primaryColor}
            onUnreadChange={setDmUnreadCount}
            seasonReadOnly={seasonReadOnly}
          />
        )}
        </div>
      )}
    </div>
  );
}
