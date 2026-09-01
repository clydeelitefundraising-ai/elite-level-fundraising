"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AnnouncementRow, TeamFileRow } from "@/lib/teamData";
import { isHeadCoach, type TeamActor } from "@/lib/permissions";
import type { ThreadWithDetails } from "@/lib/messages";
import UpdatesWorkspaceView from "../files/UpdatesWorkspaceView";
import MessagesView from "../messages/MessagesView";

type Section = "updates" | "messages";

const SEG: Array<{ id: Section; icon: string; label: string }> = [
  { id: "updates",  icon: "📢", label: "Team Updates" },
  { id: "messages", icon: "💬", label: "Direct Messages" },
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

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: ".85rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Team Hub
        </span>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
          Communications
        </h2>
      </div>

      {/* ── Segmented control ── */}
      <div style={{
        display: "flex", gap: ".4rem", marginBottom: "1rem",
        background: "#eef0f4", padding: ".25rem", borderRadius: 12,
      }}>
        {SEG.map(s => {
          const active = section === s.id;
          const unread = s.id === "messages" ? dmUnreadCount : 0;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              style={{
                flex: 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: ".4rem",
                padding: ".55rem .5rem",
                background: active ? "#fff" : "transparent",
                boxShadow: active ? "0 1px 4px rgba(0,0,0,.1)" : "none",
                border: "none", borderRadius: 9,
                fontSize: ".8rem", fontWeight: 700,
                color: active ? "#0b1e3d" : "#6b7280",
                cursor: "pointer",
                transition: "background .15s ease, box-shadow .15s ease",
              }}
            >
              <span>{s.icon}</span>{s.label}
              {unread > 0 && (
                <span style={{
                  background: "#dc2626",
                  color: "#fff",
                  borderRadius: 100,
                  fontSize: ".65rem",
                  fontWeight: 700,
                  padding: ".05rem .4rem",
                  minWidth: 16,
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
            background: "#fff", borderRadius: 14, padding: "3rem 1.5rem",
            textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
          }}>
            <div style={{ fontSize: "2rem", marginBottom: ".65rem", opacity: .35 }}>💬</div>
            <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151", marginBottom: ".3rem" }}>
              Sign in to view messages
            </div>
            <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>
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
