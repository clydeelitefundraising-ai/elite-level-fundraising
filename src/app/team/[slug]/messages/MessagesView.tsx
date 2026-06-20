"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ThreadWithDetails } from "@/lib/messages";

const ROLE_LABEL: Record<string, string> = {
  head_coach:      "Head Coach",
  assistant_coach: "Asst. Coach",
  booster:         "Booster",
  athlete:         "Athlete",
  parent:          "Parent",
};

function relativeTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)     return "just now";
  if (sec < 3600)   return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)  return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

function threadDisplayName(
  thread: ThreadWithDetails,
  actorKind: string,
  actorId: string,
): string {
  const others = thread.participants.filter(p => {
    if (p.is_observer) return false;
    if (actorKind === "coach") return !(p.actor_type === "coach" && p.coach_id === actorId);
    return !(p.actor_type === "member" && p.member_id === actorId);
  });
  const names = others.slice(0, 3).map(p => p.name);
  const extra = others.length > 3 ? ` +${others.length - 3}` : "";
  return names.join(", ") + extra || "Thread";
}

function threadSubtitle(thread: ThreadWithDetails): string {
  const hasFamily =
    thread.participants.some(p => p.role === "athlete") &&
    thread.participants.some(p => p.role === "parent");
  if (hasFamily) return "Family thread";
  return "";
}

// ─── Thread card ─────────────────────────────────────────────────────────────

function ThreadCard({
  thread,
  actorKind,
  actorId,
  primaryColor,
  onClick,
}: {
  thread: ThreadWithDetails;
  actorKind: string;
  actorId: string;
  primaryColor: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isUnread = thread.unread_count > 0;
  const displayName = threadDisplayName(thread, actorKind, actorId);
  const subtitle = threadSubtitle(thread);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        background:   isUnread ? "#fff" : "#f9fafb",
        borderRadius: 12,
        padding:      ".7rem .9rem",
        marginBottom: ".45rem",
        boxShadow:    hovered
          ? "0 4px 14px rgba(0,0,0,.09), 0 0 0 1px rgba(0,0,0,.05)"
          : "0 1px 3px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        borderLeft:   `3px solid ${isUnread ? primaryColor : "#e5e7eb"}`,
        cursor:       "pointer",
        transform:    hovered ? "translateY(-1px)" : "none",
        transition:   "transform .13s ease, box-shadow .13s ease",
        display:      "flex",
        gap:          ".7rem",
        alignItems:   "flex-start",
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 40, height: 40, borderRadius: "50%",
        background: isUnread ? primaryColor : "#d1d5db",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "1rem", flexShrink: 0, color: "#fff", fontWeight: 700,
      }}>
        💬
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: ".4rem" }}>
          <span style={{
            fontWeight: isUnread ? 800 : 600,
            fontSize:   ".88rem",
            color:      "#0b1e3d",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {thread.subject ?? displayName}
          </span>
          <span style={{ fontSize: ".65rem", color: "#9ca3af", flexShrink: 0 }}>
            {relativeTime(thread.last_message_at)}
          </span>
        </div>
        {thread.subject && (
          <span style={{ fontSize: ".72rem", color: "#6b7280", display: "block", marginBottom: ".1rem" }}>
            {displayName}
          </span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: ".35rem" }}>
          <span style={{
            fontSize: ".77rem",
            color: isUnread ? "#374151" : "#9ca3af",
            fontWeight: isUnread ? 500 : 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}>
            {thread.last_message_preview ?? "Start a conversation…"}
          </span>
          {subtitle && (
            <span style={{
              fontSize: ".55rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: ".04em", background: "#ecfdf5", color: "#065f46",
              padding: ".05rem .28rem", borderRadius: 100, flexShrink: 0,
            }}>
              {subtitle}
            </span>
          )}
          {isUnread && (
            <span style={{
              background: primaryColor, color: "#fff",
              borderRadius: 100, fontSize: ".55rem", fontWeight: 700,
              padding: ".1rem .3rem", minWidth: 16, textAlign: "center", flexShrink: 0,
            }}>
              {thread.unread_count}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Compose modal ────────────────────────────────────────────────────────────

type DirectoryEntry = { id: string; name: string; role: string; athlete_id?: string | null };
type Directory = { coaches: DirectoryEntry[]; athletes: DirectoryEntry[]; parents: DirectoryEntry[] };

type RecipientType = "athlete" | "parent" | "coach";

function ComposeModal({
  slug,
  isStaff,
  primaryColor,
  onClose,
  onCreated,
}: {
  slug: string;
  isStaff: boolean;
  primaryColor: string;
  onClose: () => void;
  onCreated: (threadId: string) => void;
}) {
  const [dir, setDir] = useState<Directory | null>(null);
  const [recipientType, setRecipientType] = useState<RecipientType | null>(
    isStaff ? null : "coach",
  );
  const [recipientId, setRecipientId] = useState("");
  const [subject, setSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch(`/api/team/${slug}/messages/directory`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setDir(d))
      .catch(() => {});
  }, [slug]);

  useEffect(() => {
    setRecipientId("");
  }, [recipientType]);

  const recipients: DirectoryEntry[] = recipientType === "coach"
    ? (dir?.coaches ?? [])
    : recipientType === "athlete"
      ? (dir?.athletes ?? [])
      : (dir?.parents ?? []);

  const selectedRecipient = recipients.find(r => r.id === recipientId);
  const actorType = recipientType === "coach" ? "coach" : "member";

  const safetyNote = recipientType === "athlete"
    ? "Parent/guardian will be included. Head coach oversight applies."
    : recipientType === "parent"
      ? "Athlete will be included. Head coach oversight applies."
      : null;

  const handleSend = async () => {
    if (!recipientId || !msgBody.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/team/${slug}/messages/threads`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          recipient_actor_type: actorType,
          recipient_id:         recipientId,
          subject:              subject.trim() || null,
          body:                 msgBody.trim(),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to send.");
        setSending(false);
        return;
      }
      const data = await res.json();
      onCreated(data.thread_id);
    } catch {
      setError("Network error. Please try again.");
      setSending(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,.45)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "elf-backdropIn .18s ease both",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(430px,100%)",
          background: "#fff",
          borderRadius: "18px 18px 0 0",
          padding: "1.2rem 1rem 2rem",
          animation: "elf-modalIn .2s ease both",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#0b1e3d", flex: 1 }}>
            New Message
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", fontSize: "1.1rem",
              cursor: "pointer", color: "#9ca3af", lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Recipient type picker (coaches only) */}
        {isStaff && (
          <div style={{ marginBottom: ".9rem" }}>
            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#6b7280", marginBottom: ".4rem" }}>
              Send to
            </div>
            <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
              {(["athlete", "parent", "coach"] as RecipientType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setRecipientType(t)}
                  style={{
                    padding:    ".3rem .7rem",
                    borderRadius: 100,
                    fontSize:   ".75rem",
                    fontWeight: 600,
                    border:     `1.5px solid ${recipientType === t ? primaryColor : "#e5e7eb"}`,
                    background: recipientType === t ? primaryColor : "#fff",
                    color:      recipientType === t ? "#fff" : "#374151",
                    cursor:     "pointer",
                    transition: "all .12s",
                    textTransform: "capitalize",
                  }}
                >
                  {t === "athlete" ? "Athlete" : t === "parent" ? "Parent" : "Coach"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recipient picker */}
        {recipientType && (
          <div style={{ marginBottom: ".9rem" }}>
            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#6b7280", marginBottom: ".4rem" }}>
              {isStaff ? "Choose recipient" : "Choose coach"}
            </div>
            {dir ? (
              <select
                value={recipientId}
                onChange={e => setRecipientId(e.target.value)}
                style={{
                  width: "100%", padding: ".55rem .65rem",
                  borderRadius: 8, border: "1.5px solid #e5e7eb",
                  fontSize: ".85rem", color: "#374151",
                  background: "#fff", appearance: "none",
                  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239CA3AF'%3E%3Cpath d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z'/%3E%3C/svg%3E\")",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right .5rem center",
                  backgroundSize: "1.2rem",
                }}
              >
                <option value="">Select…</option>
                {recipients.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {ROLE_LABEL[r.role] ?? r.role}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>Loading…</div>
            )}
          </div>
        )}

        {/* Safety note */}
        {safetyNote && recipientId && (
          <div style={{
            background: "#f0fdf4", border: "1px solid #bbf7d0",
            borderRadius: 8, padding: ".55rem .7rem",
            fontSize: ".75rem", color: "#166534",
            marginBottom: ".9rem", display: "flex", gap: ".35rem", alignItems: "flex-start",
          }}>
            <span>🛡️</span>
            <span>{safetyNote}</span>
          </div>
        )}

        {/* Subject */}
        <div style={{ marginBottom: ".75rem" }}>
          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#6b7280", marginBottom: ".3rem" }}>
            Subject (optional)
          </div>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="What's this about?"
            maxLength={100}
            style={{
              width: "100%", padding: ".5rem .65rem",
              borderRadius: 8, border: "1.5px solid #e5e7eb",
              fontSize: ".85rem", color: "#374151",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Message */}
        <div style={{ marginBottom: ".9rem" }}>
          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#6b7280", marginBottom: ".3rem" }}>
            Message
          </div>
          <textarea
            ref={textareaRef}
            value={msgBody}
            onChange={e => setMsgBody(e.target.value)}
            placeholder="Type your message…"
            maxLength={3000}
            rows={4}
            style={{
              width: "100%", padding: ".55rem .65rem",
              borderRadius: 8, border: "1.5px solid #e5e7eb",
              fontSize: ".85rem", color: "#374151",
              resize: "vertical", minHeight: 80,
              boxSizing: "border-box", lineHeight: 1.5,
            }}
          />
          <div style={{ textAlign: "right", fontSize: ".65rem", color: "#9ca3af", marginTop: ".2rem" }}>
            {msgBody.length}/3000
          </div>
        </div>

        {error && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: 8, padding: ".5rem .7rem",
            fontSize: ".78rem", color: "#dc2626", marginBottom: ".75rem",
          }}>
            {error}
          </div>
        )}

        {selectedRecipient && (
          <div style={{
            fontSize: ".72rem", color: "#6b7280", marginBottom: ".75rem",
            padding: ".4rem .6rem", background: "#f9fafb", borderRadius: 8,
          }}>
            To: <strong>{selectedRecipient.name}</strong> ({ROLE_LABEL[selectedRecipient.role] ?? selectedRecipient.role})
            {recipientType !== "coach" && " + family"}
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={sending || !recipientId || !msgBody.trim()}
          style={{
            width: "100%", padding: ".7rem",
            background: primaryColor,
            color: "#fff", border: "none", borderRadius: 10,
            fontSize: ".9rem", fontWeight: 700,
            cursor: sending || !recipientId || !msgBody.trim() ? "default" : "pointer",
            opacity: sending || !recipientId || !msgBody.trim() ? .5 : 1,
            transition: "opacity .15s",
          }}
        >
          {sending ? "Sending…" : "Send Message"}
        </button>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function MessagesView({
  slug,
  initialThreads,
  actorKind,
  actorId,
  actorName,
  isStaff,
  primaryColor,
}: {
  slug: string;
  initialThreads: ThreadWithDetails[];
  actorKind: "coach" | "member";
  actorId: string;
  actorName: string;
  isStaff: boolean;
  primaryColor: string;
}) {
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadWithDetails[]>(initialThreads);
  const [showCompose, setShowCompose] = useState(false);

  const handleCreated = (threadId: string) => {
    setShowCompose(false);
    // Dispatch so nav badge updates
    window.dispatchEvent(new CustomEvent("elf:messages-changed"));
    router.push(`/team/${slug}/messages/${threadId}`);
  };

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: ".75rem" }}>
        <div style={{ flex: 1 }}>
          <span style={{
            fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3",
            textTransform: "uppercase", letterSpacing: ".1em", display: "block",
          }}>
            Private
          </span>
          <h2 style={{
            margin: 0, fontSize: "1.1rem", fontWeight: 800,
            color: "#0b1e3d", letterSpacing: "-.01em",
          }}>
            Messages
          </h2>
        </div>
        <button
          onClick={() => setShowCompose(true)}
          style={{
            background: primaryColor, color: "#fff",
            border: "none", borderRadius: 10,
            padding: ".4rem .85rem",
            fontSize: ".78rem", fontWeight: 700,
            cursor: "pointer",
            display: "flex", alignItems: "center", gap: ".3rem",
          }}
        >
          <span>+</span> New
        </button>
      </div>

      {/* Thread list */}
      {threads.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "3rem 1.5rem",
          textAlign: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: ".65rem", opacity: .3 }}>💬</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151", marginBottom: ".3rem" }}>
            No messages yet
          </div>
          <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>
            {isStaff
              ? "Tap + New to start a conversation with an athlete, parent, or coach."
              : "Your coach will start a conversation with you here."}
          </div>
        </div>
      ) : (
        threads.map(t => (
          <ThreadCard
            key={t.id}
            thread={t}
            actorKind={actorKind}
            actorId={actorId}
            primaryColor={primaryColor}
            onClick={() => router.push(`/team/${slug}/messages/${t.id}`)}
          />
        ))
      )}

      {showCompose && (
        <ComposeModal
          slug={slug}
          isStaff={isStaff}
          primaryColor={primaryColor}
          onClose={() => setShowCompose(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
