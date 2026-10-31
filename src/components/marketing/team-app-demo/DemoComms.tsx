"use client";

import { Megaphone, MessageCircle } from "lucide-react";
import { isHeadCoach, isStaff, isCoachOnlyRole, type TeamActor } from "@/lib/permissions";
import { unreadMessageCount, type DemoPerson, type DemoStore } from "./commsData";
import { DemoUpdatesSection, useDemoUpdatesWorkspace } from "./DemoUpdates";
import { DemoMessagesView, DemoThreadView } from "./DemoMessages";
import type { DemoRole } from "./demoProtocol";

// Twin of communications/CommunicationsView.tsx — the Comms tab's page
// header and Updates/Messages segmented control — plus the conversation
// screen (a separate route in the real app, shown in place here). Role
// gates are the app's: staff post and manage updates, only head/assistant
// coaches create groups, the Head Coach gets For Me / Oversight.

export type CommsSection = "updates" | "messages";

const SEG = [
  { id: "updates" as const,  icon: Megaphone,     label: "Updates" },
  { id: "messages" as const, icon: MessageCircle, label: "Messages" },
];

type Props = {
  role: DemoRole;
  actor: TeamActor;
  me: DemoPerson;
  store: DemoStore;
  setStore: (fn: (s: DemoStore) => DemoStore) => void;
  section: CommsSection;
  setSection: (s: CommsSection) => void;
  openThreadId: string | null;
  setOpenThreadId: (id: string | null) => void;
  notify: (message?: string) => void;
};

export default function DemoComms({ role, actor, me, store, setStore, section, setSection, openThreadId, setOpenThreadId, notify }: Props) {
  const workspace = useDemoUpdatesWorkspace({
    store, setStore, role, me, canEdit: isStaff(actor), canDelete: isHeadCoach(actor), notify,
  });
  const dmUnreadCount = unreadMessageCount(store, me.key);

  if (openThreadId) {
    return (
      <DemoThreadView
        store={store} setStore={setStore} me={me} threadId={openThreadId} notify={notify}
        onBack={() => { setOpenThreadId(null); setSection("messages"); }}
      />
    );
  }

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
      <div style={{ marginBottom: ".7rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Team Hub
        </span>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em", lineHeight: 1.2 }}>
          Communications
        </h2>
      </div>

      {tabNav}

      {section === "updates" && (
        <DemoUpdatesSection workspace={workspace} ctx={{ store, setStore, me, notify }} />
      )}

      {section === "messages" && (
        <DemoMessagesView
          store={store}
          setStore={setStore}
          me={me}
          isStaff={isStaff(actor)}
          isHeadCoach={isHeadCoach(actor)}
          canCreateGroup={actor.kind === "coach" && isCoachOnlyRole(actor.session.role)}
          onOpenThread={setOpenThreadId}
          notify={notify}
        />
      )}
    </div>
  );
}
