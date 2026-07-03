"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { MessageThread, ResolvedParticipant, ResolvedMessage } from "@/lib/messages";

const ROLE_LABEL: Record<string, string> = {
  head_coach:      "Head Coach",
  assistant_coach: "Asst. Coach",
  booster:         "Booster",
  athlete:         "Athlete",
  parent:          "Parent",
};

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60)    return "just now";
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(d);
}

function initials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function isOwnMessage(
  msg: ResolvedMessage,
  actorKind: string,
  actorId: string,
): boolean {
  if (actorKind === "coach")  return msg.sender_coach_id  === actorId;
  return msg.sender_member_id === actorId;
}

// ─── Message bubble ──────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  isSelf,
  primaryColor,
}: {
  msg: ResolvedMessage;
  isSelf: boolean;
  primaryColor: string;
}) {
  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  isSelf ? "row-reverse" : "row",
        alignItems:     "flex-end",
        gap:            ".45rem",
        marginBottom:   ".65rem",
      }}
    >
      {/* Avatar */}
      {!isSelf && (
        <div style={{
          width: 30, height: 30, borderRadius: "50%",
          background: "#e5e7eb",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: ".6rem", fontWeight: 700, color: "#6b7280",
          flexShrink: 0,
        }}>
          {initials(msg.sender_name)}
        </div>
      )}

      <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: isSelf ? "flex-end" : "flex-start" }}>
        {!isSelf && (
          <span style={{ fontSize: ".65rem", color: "#9ca3af", marginBottom: ".18rem", fontWeight: 500 }}>
            {msg.sender_name} · {ROLE_LABEL[msg.sender_role] ?? msg.sender_role}
          </span>
        )}
        <div style={{
          background:   isSelf ? primaryColor : "#fff",
          color:        isSelf ? "#fff" : "#1f2937",
          borderRadius: isSelf ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          padding:      ".55rem .75rem",
          fontSize:     ".85rem",
          lineHeight:   1.5,
          boxShadow:    "0 1px 3px rgba(0,0,0,.08)",
          whiteSpace:   "pre-wrap",
          wordBreak:    "break-word",
        }}>
          {msg.body}
        </div>
        <span style={{ fontSize: ".62rem", color: "#9ca3af", marginTop: ".18rem" }}>
          {relativeTime(msg.created_at)}
        </span>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function ThreadView({
  slug,
  thread,
  participants,
  initialMessages,
  actorKind,
  actorId,
  actorName,
  primaryColor,
}: {
  slug: string;
  thread: MessageThread;
  participants: ResolvedParticipant[];
  initialMessages: ResolvedMessage[];
  actorKind: "coach" | "member";
  actorId: string;
  actorName: string;
  primaryColor: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ResolvedMessage[]>(initialMessages);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mark as read on mount
  useEffect(() => {
    fetch(`/api/team/${slug}/messages/threads/${thread.id}/read`, { method: "POST" })
      .then(() => {
        window.dispatchEvent(new CustomEvent("elf:messages-changed"));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const mainParticipants = participants.filter(p => !p.is_observer);
  const observers = participants.filter(p => p.is_observer);
  const hasFamily =
    mainParticipants.some(p => p.role === "athlete") &&
    mainParticipants.some(p => p.role === "parent");

  // Display name for others (non-self, non-observer)
  const otherNames = mainParticipants
    .filter(p => {
      if (actorKind === "coach") return !(p.actor_type === "coach" && p.coach_id === actorId);
      return !(p.actor_type === "member" && p.member_id === actorId);
    })
    .map(p => p.name);

  const threadTitle = thread.subject ?? otherNames.slice(0, 2).join(", ") ?? "Thread";

  const handleSend = useCallback(async () => {
    if (!replyBody.trim() || sending) return;
    setSending(true);
    setError("");

    // Optimistic
    const optimistic: ResolvedMessage = {
      id:               `opt-${Date.now()}`,
      thread_id:        thread.id,
      sender_type:      actorKind,
      sender_coach_id:  actorKind === "coach"  ? actorId : null,
      sender_member_id: actorKind === "member" ? actorId : null,
      body:             replyBody.trim(),
      created_at:       new Date().toISOString(),
      sender_name:      actorName,
      sender_role:      "",
      read_at:          new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    const body = replyBody.trim();
    setReplyBody("");

    try {
      const res = await fetch(
        `/api/team/${slug}/messages/threads/${thread.id}/messages`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ body }),
        },
      );
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to send.");
        setMessages(prev => prev.filter(m => m.id !== optimistic.id));
        setSending(false);
        return;
      }
      const real = await res.json();
      setMessages(prev => prev.map(m =>
        m.id === optimistic.id
          ? { ...optimistic, id: real.id, created_at: real.created_at }
          : m,
      ));
    } catch {
      setError("Network error. Please try again.");
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
    }
    setSending(false);
  }, [replyBody, sending, slug, thread.id, actorKind, actorId, actorName]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 140px)", animation: "elf-fadeUp .22s ease both" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: ".5rem",
        marginBottom: ".65rem", paddingBottom: ".65rem",
        borderBottom: "1px solid #e5e7eb",
      }}>
        <button
          onClick={() => router.push(`/team/${slug}/communications?tab=messages`)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: "1.1rem", color: "#6b7280", padding: ".1rem .2rem",
            lineHeight: 1, borderRadius: 6,
          }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 800, fontSize: ".9rem", color: "#0b1e3d",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {threadTitle}
          </div>
          <div style={{ fontSize: ".68rem", color: "#9ca3af" }}>
            {mainParticipants.length} participant{mainParticipants.length !== 1 ? "s" : ""}
            {observers.length > 0 && ` · ${observers.length} observer${observers.length !== 1 ? "s" : ""}`}
          </div>
        </div>
      </div>

      {/* Safety transparency banner */}
      {(hasFamily || observers.length > 0) && (
        <div style={{
          background: "#f0fdf4", border: "1px solid #bbf7d0",
          borderRadius: 10, padding: ".55rem .75rem",
          fontSize: ".73rem", color: "#166534",
          marginBottom: ".75rem", display: "flex", gap: ".35rem", alignItems: "flex-start",
        }}>
          <span style={{ flexShrink: 0 }}>🛡️</span>
          <span>
            {hasFamily && "Family thread — athlete and parent/guardian are included. "}
            {observers.length > 0 && (
              <>
                {observers.map(o => o.name).join(", ")} ({ROLE_LABEL[observers[0]?.role] ?? "Coach"}) included for oversight.
              </>
            )}
          </span>
        </div>
      )}

      {/* Participant strip */}
      <div style={{
        display: "flex", gap: ".3rem", flexWrap: "wrap",
        marginBottom: ".75rem",
      }}>
        {participants.map(p => (
          <span
            key={p.id}
            style={{
              padding: ".18rem .5rem",
              borderRadius: 100,
              fontSize: ".65rem",
              fontWeight: 600,
              background: p.is_observer ? "#fef3c7" : "#ede9fe",
              color:      p.is_observer ? "#92400e" : "#5b21b6",
              display: "flex", alignItems: "center", gap: ".25rem",
            }}
          >
            {p.is_observer && <span style={{ fontSize: ".6rem" }}>👁</span>}
            {p.name}
          </span>
        ))}
      </div>

      {/* Messages */}
      <div style={{ flex: 1 }}>
        {messages.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "2rem",
            fontSize: ".85rem", color: "#9ca3af",
          }}>
            No messages yet. Say something!
          </div>
        ) : (
          messages.map(m => (
            <MessageBubble
              key={m.id}
              msg={m}
              isSelf={isOwnMessage(m, actorKind, actorId)}
              primaryColor={primaryColor}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <div style={{
        borderTop: "1px solid #e5e7eb",
        paddingTop: ".75rem",
        marginTop: ".75rem",
        position: "sticky",
        bottom: 80,
        background: "#f5f6f8",
      }}>
        {error && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: 8, padding: ".4rem .6rem",
            fontSize: ".75rem", color: "#dc2626", marginBottom: ".5rem",
          }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: ".5rem", alignItems: "flex-end" }}>
          <textarea
            ref={textareaRef}
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply… (⌘+Enter to send)"
            maxLength={3000}
            rows={2}
            style={{
              flex: 1,
              padding: ".5rem .65rem",
              borderRadius: 10,
              border: "1.5px solid #e5e7eb",
              fontSize: ".85rem",
              color: "#374151",
              resize: "none",
              lineHeight: 1.5,
              background: "#fff",
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !replyBody.trim()}
            style={{
              padding: ".5rem .85rem",
              background: primaryColor,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: ".82rem",
              fontWeight: 700,
              cursor: sending || !replyBody.trim() ? "default" : "pointer",
              opacity: sending || !replyBody.trim() ? .45 : 1,
              transition: "opacity .15s",
              flexShrink: 0,
            }}
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
