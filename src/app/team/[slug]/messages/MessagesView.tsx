"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ThreadWithDetails } from "@/lib/messages";
import {
  roleLabel, otherParticipants, conversationDisplayName, isFamilyThread,
} from "./_shared/participantDisplay";
import Avatar from "./_shared/Avatar";

function relativeTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)     return "just now";
  if (sec < 3600)   return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)  return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
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
  const others = otherParticipants(thread.participants, actorKind as "coach" | "member", actorId);
  const displayName = conversationDisplayName(thread.participants, actorKind as "coach" | "member", actorId);
  const family = isFamilyThread(thread.participants);
  // Avatar: the single most prominent other participant. Falls back to a
  // generic conversation icon only in the edge case of no other
  // participants resolving (shouldn't normally happen).
  const primaryOther = others[0];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onClick(); }}
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
      {primaryOther ? (
        <Avatar name={primaryOther.name} photoUrl={primaryOther.photo_url} size={40} />
      ) : (
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          background: "#d1d5db", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1rem", flexShrink: 0, color: "#fff", fontWeight: 700,
        }}>
          💬
        </div>
      )}

      {/* Content — participant name(s) are the PRIMARY identity. A legacy
          subject (only present on threads created before Phase 2B) appears
          as small secondary context underneath, never as the primary line. */}
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
            {displayName}
          </span>
          <span style={{ fontSize: ".65rem", color: "#9ca3af", flexShrink: 0 }}>
            {relativeTime(thread.last_message_at)}
          </span>
        </div>
        {thread.subject && (
          <span style={{ fontSize: ".68rem", color: "#9ca3af", display: "block", marginBottom: ".1rem", fontStyle: "italic" }}>
            {thread.subject}
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
          {family && (
            <span style={{
              fontSize: ".55rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: ".04em", background: "#ecfdf5", color: "#065f46",
              padding: ".05rem .28rem", borderRadius: 100, flexShrink: 0,
            }}>
              Family
            </span>
          )}
          {isUnread && (
            <span
              aria-label={`${thread.unread_count} unread message${thread.unread_count !== 1 ? "s" : ""}`}
              style={{
                background: primaryColor, color: "#fff",
                borderRadius: 100, fontSize: ".55rem", fontWeight: 700,
                padding: ".1rem .3rem", minWidth: 16, textAlign: "center", flexShrink: 0,
              }}
            >
              {thread.unread_count}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Compose modal ────────────────────────────────────────────────────────────

type DirectoryEntry = { id: string; name: string; role: string; athlete_id?: string | null; photo_url?: string | null };
type Directory = { coaches: DirectoryEntry[]; athletes: DirectoryEntry[]; parents: DirectoryEntry[] };

type RecipientType = "athlete" | "parent" | "coach";
type ComposeStep = "recipient" | "message";

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
  const [step, setStep] = useState<ComposeStep>("recipient");
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
    // Resetting a derived selection when its own category changes is the
    // correct use of an effect here (external-ish concern: recipientType
    // is a separate control the user just changed).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecipientId("");
  }, [recipientType]);

  useEffect(() => {
    if (step === "message") textareaRef.current?.focus();
  }, [step]);

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
        display: "flex", alignItems: "center", justifyContent: "center",
        // 100dvh-based padding (not 100vh) so this reflows correctly when the
        // on-screen keyboard shrinks the visual viewport, instead of leaving
        // the sheet anchored under content the keyboard has covered.
        padding: "max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom))",
        animation: "elf-backdropIn .18s ease both",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(430px,100%)",
          background: "#fff",
          borderRadius: 18,
          padding: "1.2rem 1rem",
          animation: "elf-modalIn .2s ease both",
          maxHeight: "calc(100dvh - 2rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: "1rem" }}>
          {step === "message" && (
            <button
              onClick={() => setStep("recipient")}
              aria-label="Back to choose recipient"
              style={{
                background: "none", border: "none", fontSize: "1.1rem",
                cursor: "pointer", color: "#6b7280", lineHeight: 1, marginRight: ".5rem", padding: ".1rem",
              }}
            >
              ←
            </button>
          )}
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#0b1e3d", flex: 1 }}>
            {step === "recipient" ? "New Message" : "Message"}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none", border: "none", fontSize: "1.1rem",
              cursor: "pointer", color: "#9ca3af", lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Step 1: choose recipient — this IS the identity of the
            conversation, so it stays prominent even once selected. ── */}
        {step === "recipient" && (
          <>
            {isStaff && (
              <div style={{ marginBottom: ".9rem" }}>
                <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#6b7280", marginBottom: ".4rem" }}>
                  Message a…
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

            {recipientType && (
              <div style={{ marginBottom: ".9rem" }}>
                <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#6b7280", marginBottom: ".5rem" }}>
                  {isStaff ? "Choose recipient" : "Choose coach"}
                </div>
                {dir ? (
                  recipients.length === 0 ? (
                    <div style={{ fontSize: ".82rem", color: "#9ca3af" }}>No one to message here yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
                      {recipients.map(r => {
                        const active = r.id === recipientId;
                        return (
                          <button
                            key={r.id}
                            onClick={() => setRecipientId(r.id)}
                            style={{
                              display: "flex", alignItems: "center", gap: ".6rem",
                              padding: ".5rem .6rem", borderRadius: 10, textAlign: "left",
                              border: `1.5px solid ${active ? primaryColor : "#e5e7eb"}`,
                              background: active ? `${primaryColor}12` : "#fff",
                              cursor: "pointer",
                            }}
                          >
                            <Avatar name={r.name} photoUrl={r.photo_url ?? null} size={34} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#0b1e3d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.name}
                              </div>
                              <div style={{ fontSize: ".7rem", color: "#9ca3af" }}>{roleLabel(r.role)}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>Loading…</div>
                )}
              </div>
            )}

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

            <button
              onClick={() => recipientId && setStep("message")}
              disabled={!recipientId}
              style={{
                width: "100%", padding: ".7rem",
                background: primaryColor,
                color: "#fff", border: "none", borderRadius: 10,
                fontSize: ".9rem", fontWeight: 700,
                cursor: recipientId ? "pointer" : "default",
                opacity: recipientId ? 1 : .5,
                transition: "opacity .15s",
              }}
            >
              Next
            </button>
          </>
        )}

        {/* ── Step 2: write the first message — recipient stays visible,
            prominent, but the composer itself is the focus. No subject
            field: the conversation is identified by who it's with. ── */}
        {step === "message" && selectedRecipient && (
          <>
            <div style={{
              display: "flex", alignItems: "center", gap: ".6rem",
              padding: ".55rem .6rem", background: "#f9fafb", borderRadius: 10,
              marginBottom: "1rem",
            }}>
              <Avatar name={selectedRecipient.name} photoUrl={selectedRecipient.photo_url ?? null} size={38} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: ".9rem", fontWeight: 800, color: "#0b1e3d" }}>{selectedRecipient.name}</div>
                <div style={{ fontSize: ".72rem", color: "#6b7280" }}>
                  {roleLabel(selectedRecipient.role)}{recipientType !== "coach" && " · family included"}
                </div>
              </div>
            </div>

            <textarea
              ref={textareaRef}
              value={msgBody}
              onChange={e => setMsgBody(e.target.value)}
              placeholder="Type your message…"
              maxLength={3000}
              rows={5}
              aria-label="Message"
              style={{
                width: "100%", padding: ".65rem .75rem",
                borderRadius: 10, border: "1.5px solid #e5e7eb",
                fontSize: "1rem", color: "#374151",
                resize: "vertical", minHeight: 110,
                boxSizing: "border-box", lineHeight: 1.5,
                marginBottom: ".3rem",
              }}
            />
            <div style={{ textAlign: "right", fontSize: ".65rem", color: "#9ca3af", marginBottom: ".9rem" }}>
              {msgBody.length}/3000
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

            <button
              onClick={handleSend}
              disabled={sending || !msgBody.trim()}
              style={{
                width: "100%", padding: ".7rem",
                background: primaryColor,
                color: "#fff", border: "none", borderRadius: 10,
                fontSize: ".9rem", fontWeight: 700,
                cursor: sending || !msgBody.trim() ? "default" : "pointer",
                opacity: sending || !msgBody.trim() ? .5 : 1,
                transition: "opacity .15s",
              }}
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </>
        )}
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
          aria-label="Start a new message"
          style={{
            background: primaryColor, color: "#fff",
            border: "none", borderRadius: 10,
            padding: ".4rem .85rem",
            fontSize: ".78rem", fontWeight: 700,
            cursor: "pointer",
            display: "flex", alignItems: "center", gap: ".3rem",
          }}
        >
          <span aria-hidden="true">+</span> New
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
