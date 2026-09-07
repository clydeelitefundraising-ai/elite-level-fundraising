"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Megaphone, MessageCircle } from "lucide-react";
import type { AnnouncementRow, TeamFileRow } from "@/lib/teamData";
import { isHeadCoach, type TeamActor } from "@/lib/permissions";
import type { ThreadWithDetails } from "@/lib/messages";
import UpdatesWorkspaceView from "../files/UpdatesWorkspaceView";
import MessagesView from "../messages/MessagesView";

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

  // Phase 6: flat underline tabs, replacing the old boxed/pill segmented
  // control — same pattern as team/RosterTabs.tsx's secondaryDesktopNav,
  // used here at every width (not just desktop) since Communications never
  // had a "pill on mobile, underline on desktop" split to begin with; this
  // one tab treatment now serves both. Section state/switching logic is
  // completely unchanged.
  const tabNav = (
    <div
      role="tablist"
      aria-label="Communications section"
      style={{ display: "flex", gap: "1.4rem", borderBottom: "1px solid var(--border-app)", marginBottom: "1.1rem" }}
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
              background: "none",
              border: "none",
              borderBottom: active ? "2px solid var(--team-primary)" : "2px solid transparent",
              cursor: "pointer",
              padding: "0 0 .6rem",
              fontSize: ".8rem",
              fontWeight: active ? 700 : 500,
              color: active ? "var(--text-primary-app)" : "var(--text-muted-app)",
              display: "flex", alignItems: "center", gap: ".4rem",
            }}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
            {unread > 0 && (
              <span style={{
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
      <div style={{ marginBottom: ".85rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Team Hub
        </span>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em", lineHeight: 1.2 }}>
          Communications
        </h2>
      </div>

      {/* ── Section nav — same flat tab treatment at every width now.
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

      {/* ── Section 2: Direct Messages ── */}
      {section === "messages" && (
        actorKind === null ? (
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
            primaryColor={primaryColor}
            onUnreadChange={setDmUnreadCount}
          />
        )
      )}
    </div>
  );
}
