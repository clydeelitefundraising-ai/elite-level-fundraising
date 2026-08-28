"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { MessageThread, ResolvedParticipant, ResolvedMessage } from "@/lib/messages";
import {
  roleLabel, otherParticipants, observerParticipants, conversationDisplayName, isFamilyThread,
} from "../_shared/participantDisplay";
import Avatar from "../_shared/Avatar";

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
  showSenderInfo,
  primaryColor,
}: {
  msg: ResolvedMessage;
  isSelf: boolean;
  showSenderInfo: boolean;
  primaryColor: string;
}) {
  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  isSelf ? "row-reverse" : "row",
        alignItems:     "flex-end",
        gap:            ".45rem",
        marginBottom:   ".5rem",
      }}
    >
      {/* Avatar — only on the other side, and only on the last bubble of a
          run from the same sender, so consecutive messages don't repeat it. */}
      {!isSelf && (
        <div style={{ width: 28, flexShrink: 0 }}>
          {showSenderInfo && <Avatar name={msg.sender_name} photoUrl={msg.sender_photo_url} size={28} />}
        </div>
      )}

      <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: isSelf ? "flex-end" : "flex-start" }}>
        {!isSelf && showSenderInfo && (
          <span style={{ fontSize: ".65rem", color: "#9ca3af", marginBottom: ".18rem", fontWeight: 500 }}>
            {msg.sender_name} · {roleLabel(msg.sender_role)}
          </span>
        )}
        <div style={{
          background:   isSelf ? primaryColor : "#fff",
          color:        isSelf ? "#fff" : "#1f2937",
          borderRadius: isSelf ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          padding:      ".6rem .8rem",
          fontSize:     "1rem",
          lineHeight:   1.45,
          boxShadow:    "0 1px 3px rgba(0,0,0,.08)",
          whiteSpace:   "pre-wrap",
          wordBreak:    "break-word",
          overflowWrap: "anywhere",
        }}>
          {msg.body}
        </div>
        <span style={{ fontSize: ".6rem", color: "#c1c7d0", marginTop: ".15rem" }}>
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
  actorKind: "coach" | "member" | "platform_admin";
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

  // otherParticipants/conversationDisplayName only know "coach"|"member" —
  // same cast pattern already used at MessagesView.tsx:37-38 for the same
  // reason. A platform admin isn't a participant in any existing thread,
  // so this is display-only and changes nothing observable.
  const others = otherParticipants(participants, actorKind as "coach" | "member", actorId);
  const observers = observerParticipants(participants);
  const family = isFamilyThread(participants);
  const displayName = conversationDisplayName(participants, actorKind as "coach" | "member", actorId);
  const primaryOther = others[0];

  const handleSend = useCallback(async () => {
    if (!replyBody.trim() || sending) return;
    setSending(true);
    setError("");

    // Optimistic — replaced by the real row once the POST resolves.
    const optimistic: ResolvedMessage = {
      id:               `opt-${Date.now()}`,
      thread_id:        thread.id,
      sender_type:      actorKind,
      sender_coach_id:          actorKind === "coach"          ? actorId : null,
      sender_member_id:         actorKind === "member"         ? actorId : null,
      sender_platform_admin_id: actorKind === "platform_admin" ? actorId : null,
      body:             replyBody.trim(),
      created_at:       new Date().toISOString(),
      sender_name:      actorName,
      sender_role:      "",
      sender_photo_url: null,
      read_at:          new Date().toISOString(),
      attachments:      [],
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
    // 100dvh, not 100vh — 100vh does not shrink when the iOS on-screen
    // keyboard opens, which left the composer stuck below the visible
    // area. 100dvh tracks the actual visible viewport.
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100dvh - 140px)", animation: "elf-fadeUp .22s ease both" }}>
      {/* Header — participant identity is primary. Legacy subject (only on
          threads created before Phase 2B) appears as small secondary
          context, never as the primary line. */}
      <div style={{
        display: "flex", alignItems: "center", gap: ".6rem",
        marginBottom: ".5rem", paddingBottom: ".65rem",
        borderBottom: "1px solid #e5e7eb",
      }}>
        <button
          onClick={() => router.push(`/team/${slug}/communications?tab=messages`)}
          aria-label="Back to messages"
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: "1.2rem", color: "#6b7280", padding: ".2rem .3rem",
            lineHeight: 1, borderRadius: 6, flexShrink: 0,
          }}
        >
          ←
        </button>
        {primaryOther && <Avatar name={primaryOther.name} photoUrl={primaryOther.photo_url} size={36} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 800, fontSize: ".95rem", color: "#0b1e3d",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {displayName}
          </div>
          {thread.subject && (
            <div style={{ fontSize: ".68rem", color: "#9ca3af", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {thread.subject}
            </div>
          )}
        </div>
      </div>

      {/* Subordinate context line — family inclusion + oversight, kept
          small and secondary to the header rather than a full-width
          banner competing with it. */}
      {(family || observers.length > 0) && (
        <div style={{
          display: "flex", flexDirection: "column", gap: ".2rem",
          marginBottom: ".65rem", fontSize: ".72rem", color: "#6b7280",
        }}>
          {family && (
            <div style={{ display: "flex", alignItems: "center", gap: ".3rem" }}>
              <span aria-hidden="true">🛡️</span>
              <span>Parent/guardian included</span>
            </div>
          )}
          {observers.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: ".3rem" }}>
              <span aria-hidden="true">👁</span>
              <span>{observers.map(o => o.name).join(", ")} included for oversight</span>
            </div>
          )}
        </div>
      )}

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
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const sameSenderAsPrev = prev
              ? prev.sender_coach_id === m.sender_coach_id && prev.sender_member_id === m.sender_member_id
              : false;
            return (
              <MessageBubble
                key={m.id}
                msg={m}
                isSelf={isOwnMessage(m, actorKind, actorId)}
                showSenderInfo={!sameSenderAsPrev}
                primaryColor={primaryColor}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply box — sticky at a fixed offset matching the team shell's own
          reserved bottom-nav space (layout.tsx's <main> uses the same
          5.5rem bottom padding), plus a genuine safe-area buffer on top of
          that, rather than a magic hardcoded pixel value with no relation
          to either the nav's real height or the device's safe area. */}
      <div style={{
        borderTop: "1px solid #e5e7eb",
        paddingTop: ".75rem",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        marginTop: ".75rem",
        position: "sticky",
        bottom: "5.5rem",
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
            aria-label="Reply"
            style={{
              flex: 1,
              padding: ".55rem .7rem",
              borderRadius: 10,
              border: "1.5px solid #e5e7eb",
              fontSize: "1rem",
              color: "#374151",
              resize: "none",
              lineHeight: 1.5,
              background: "#fff",
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !replyBody.trim()}
            aria-label="Send message"
            style={{
              padding: ".55rem .9rem",
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
              minHeight: 40,
            }}
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
