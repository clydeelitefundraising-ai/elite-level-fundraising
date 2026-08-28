"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ThreadWithDetails } from "@/lib/messages";
import {
  roleLabel, otherParticipants, conversationDisplayName, isFamilyThread, selfParticipantRow,
} from "./_shared/participantDisplay";
import Avatar from "./_shared/Avatar";
import AttachmentPickerButton from "./_shared/AttachmentPickerButton";
import AttachmentComposerBar from "./_shared/AttachmentComposerBar";
import { useSelectedAttachments } from "./_shared/useSelectedAttachments";
import { uploadMessageAttachments } from "./_shared/uploadMessageAttachments";

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
  const [search, setSearch] = useState("");
  const [step, setStep] = useState<ComposeStep>("recipient");
  const [msgBody, setMsgBody] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "resolving" | "uploading" | "sending">("idle");
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { selected, selectionError, addFiles, removeFile, updateStatus } = useSelectedAttachments();

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
    setSearch("");
  }, [recipientType]);

  useEffect(() => {
    if (step === "message") textareaRef.current?.focus();
  }, [step]);

  const recipients: DirectoryEntry[] = recipientType === "coach"
    ? (dir?.coaches ?? [])
    : recipientType === "athlete"
      ? (dir?.athletes ?? [])
      : (dir?.parents ?? []);

  const query = search.trim().toLowerCase();
  const filteredRecipients = query
    ? recipients.filter(r => r.name.toLowerCase().includes(query))
    : recipients;

  const searchLabel = recipientType === "athlete" ? "Search athletes"
    : recipientType === "parent" ? "Search parents"
    : "Search coaches";

  const selectedRecipient = recipients.find(r => r.id === recipientId);
  const actorType = recipientType === "coach" ? "coach" : "member";

  const safetyNote = recipientType === "athlete"
    ? "Parent/guardian will be included. Head coach oversight applies."
    : recipientType === "parent"
      ? "Athlete will be included. Head coach oversight applies."
      : null;

  const handleSend = async () => {
    const body = msgBody.trim();
    if (!recipientId || (!body && selected.length === 0)) return;
    setSending(true);
    setError("");

    // ── Pure text: exact existing one-shot flow, unchanged. ──
    if (selected.length === 0) {
      try {
        const res = await fetch(`/api/team/${slug}/messages/threads`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            recipient_actor_type: actorType,
            recipient_id:         recipientId,
            body,
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
      return;
    }

    // ── Any attachments: resolve the canonical thread first (no message
    // yet), sign/upload against that REAL thread id, then send exactly
    // once via the reply endpoint. Never calls the one-shot POST
    // /messages/threads for this path — that would either create a
    // placeholder first message or (if attachments were added there
    // too) require a second, duplicate message call. ──
    setUploadPhase("resolving");
    let threadId: string;
    try {
      const resolveRes = await fetch(`/api/team/${slug}/messages/threads/resolve`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ recipient_actor_type: actorType, recipient_id: recipientId }),
      });
      if (!resolveRes.ok) {
        const d = await resolveRes.json().catch(() => ({}));
        setError(d.error ?? "Failed to start the conversation.");
        setSending(false);
        setUploadPhase("idle");
        return;
      }
      const resolveData = await resolveRes.json();
      threadId = resolveData.thread_id;
    } catch {
      setError("Network error. Please try again.");
      setSending(false);
      setUploadPhase("idle");
      return;
    }

    setUploadPhase("uploading");
    const uploadResult = await uploadMessageAttachments(
      slug,
      threadId,
      // Reuse any already-uploaded id, but ONLY if it was uploaded
      // against this exact threadId — if resolve() ever returns a
      // different thread on retry, uploadedForThreadId won't match and
      // the file is re-uploaded fresh against the real current thread
      // instead of leaking a stale id into the wrong conversation.
      selected.map(s => ({
        localId: s.localId, file: s.file,
        attachmentId: s.attachmentId, uploadedForThreadId: s.uploadedForThreadId,
      })),
      (localId, status, err, attachmentId) => updateStatus(localId, status, err, attachmentId, threadId),
    );
    if (!uploadResult.ok) {
      setError(uploadResult.error);
      setSending(false);
      setUploadPhase("idle");
      // The thread may now exist (resolved or newly created) with no
      // message yet — harmless by design (see the approved design's
      // failure-recovery notes); recipient/body/remaining files stay in
      // the composer so the user can retry Send.
      return;
    }

    setUploadPhase("sending");
    try {
      const sendRes = await fetch(`/api/team/${slug}/messages/threads/${threadId}/messages`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ body, attachmentIds: uploadResult.attachmentIds }),
      });
      if (!sendRes.ok) {
        const d = await sendRes.json().catch(() => ({}));
        setError(d.error ?? "Failed to send.");
        setSending(false);
        setUploadPhase("idle");
        return;
      }
      onCreated(threadId);
    } catch {
      setError("Network error. Please try again.");
      setSending(false);
      setUploadPhase("idle");
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
                {dir && recipients.length > 0 && (
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={searchLabel}
                    aria-label={searchLabel}
                    style={{
                      width: "100%", padding: ".55rem .7rem", marginBottom: ".5rem",
                      borderRadius: 10, border: "1.5px solid #e5e7eb",
                      fontSize: "1rem", color: "#374151", boxSizing: "border-box",
                    }}
                  />
                )}
                {dir ? (
                  recipients.length === 0 ? (
                    <div style={{ fontSize: ".82rem", color: "#9ca3af" }}>No one to message here yet.</div>
                  ) : filteredRecipients.length === 0 ? (
                    <div style={{ fontSize: ".82rem", color: "#9ca3af", padding: ".4rem 0" }}>
                      No matches for &ldquo;{search.trim()}&rdquo;.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
                      {filteredRecipients.map(r => {
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
            <div style={{ textAlign: "right", fontSize: ".65rem", color: "#9ca3af", marginBottom: ".6rem" }}>
              {msgBody.length}/3000
            </div>

            <AttachmentComposerBar
              selected={selected}
              onRemove={removeFile}
              disabled={sending}
              selectionError={selectionError}
            />

            {error && (
              <div role="alert" style={{
                background: "#fef2f2", border: "1px solid #fecaca",
                borderRadius: 8, padding: ".5rem .7rem",
                fontSize: ".78rem", color: "#dc2626", marginBottom: ".75rem",
              }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
              <AttachmentPickerButton onFilesSelected={addFiles} disabled={sending} />
              <button
                onClick={handleSend}
                disabled={sending || (!msgBody.trim() && selected.length === 0)}
                style={{
                  flex: 1, padding: ".7rem",
                  background: primaryColor,
                  color: "#fff", border: "none", borderRadius: 10,
                  fontSize: ".9rem", fontWeight: 700,
                  cursor: sending || (!msgBody.trim() && selected.length === 0) ? "default" : "pointer",
                  opacity: sending || (!msgBody.trim() && selected.length === 0) ? .5 : 1,
                  transition: "opacity .15s",
                }}
              >
                {!sending ? "Send"
                  : uploadPhase === "resolving" ? "Starting…"
                  : uploadPhase === "uploading" ? "Uploading…"
                  : "Sending…"}
              </button>
            </div>
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
  isHeadCoach,
  primaryColor,
  onUnreadChange,
}: {
  slug: string;
  initialThreads: ThreadWithDetails[];
  actorKind: "coach" | "member";
  actorId: string;
  actorName: string;
  isStaff: boolean;
  isHeadCoach?: boolean;
  primaryColor: string;
  onUnreadChange?: (count: number) => void;
}) {
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadWithDetails[]>(initialThreads);
  const [showCompose, setShowCompose] = useState(false);
  const [hcTab, setHcTab] = useState<"forMe" | "oversight">("forMe");

  // Live refresh: a thread being read (ThreadView), or a new one being
  // created (handleCreated below), both dispatch elf:messages-changed.
  // Refetch the SAME data this page was seeded with server-side (no new
  // endpoint) so unread indicators/counts update without a full reload.
  useEffect(() => {
    const load = () => {
      fetch(`/api/team/${slug}/messages/threads`)
        .then(r => r.ok ? r.json() : null)
        .then((d: ThreadWithDetails[] | null) => { if (d) setThreads(d); })
        .catch(() => {});
    };
    window.addEventListener("elf:messages-changed", load);
    return () => window.removeEventListener("elf:messages-changed", load);
  }, [slug]);

  // Report the total unread MESSAGE count up to the parent (Communications
  // DM segment badge) whenever it changes — derived from the same threads
  // data already held here, no extra fetch.
  useEffect(() => {
    onUnreadChange?.(threads.reduce((sum, t) => sum + t.unread_count, 0));
  }, [threads, onUnreadChange]);

  const handleCreated = (threadId: string) => {
    setShowCompose(false);
    // Dispatch so nav badge updates
    window.dispatchEvent(new CustomEvent("elf:messages-changed"));
    router.push(`/team/${slug}/messages/${threadId}`);
  };

  // Head Coach only: split threads into "For Me" (this HC's own row is NOT
  // an observer row — normal participant) vs "Oversight" (this HC's own
  // row IS is_observer=true). Source of truth is the actor's own
  // participant row, never creator/participant-count/role inference.
  const forMeThreads = isHeadCoach
    ? threads.filter(t => !selfParticipantRow(t.participants, actorKind, actorId)?.is_observer)
    : threads;
  const oversightThreads = isHeadCoach
    ? threads.filter(t => selfParticipantRow(t.participants, actorKind, actorId)?.is_observer === true)
    : [];
  const forMeUnread = forMeThreads.reduce((sum, t) => sum + t.unread_count, 0);
  const oversightUnread = oversightThreads.reduce((sum, t) => sum + t.unread_count, 0);
  const visibleThreads = isHeadCoach
    ? (hcTab === "forMe" ? forMeThreads : oversightThreads)
    : threads;

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

      {/* Head Coach only: For Me / Oversight — separates threads where this
          Head Coach is a normal participant from ones they're only
          auto-included on for oversight. Never shown to non-Head-Coach
          users, who keep the plain list below. */}
      {isHeadCoach && threads.length > 0 && (
        <div style={{
          display: "flex", gap: ".4rem", marginBottom: ".75rem",
          background: "#eef0f4", padding: ".25rem", borderRadius: 12,
        }}>
          {([
            { id: "forMe" as const, label: "For Me", count: forMeUnread },
            { id: "oversight" as const, label: "Oversight", count: oversightUnread },
          ]).map(tab => {
            const active = hcTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setHcTab(tab.id)}
                style={{
                  flex: 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: ".35rem",
                  padding: ".5rem .5rem",
                  background: active ? "#fff" : "transparent",
                  boxShadow: active ? "0 1px 4px rgba(0,0,0,.1)" : "none",
                  border: "none", borderRadius: 9,
                  fontSize: ".78rem", fontWeight: 700,
                  color: active ? "#0b1e3d" : "#6b7280",
                  cursor: "pointer",
                  transition: "background .15s ease, box-shadow .15s ease",
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span style={{
                    background: active ? primaryColor : "#9ca3af", color: "#fff",
                    borderRadius: 100, fontSize: ".62rem", fontWeight: 700,
                    padding: ".05rem .35rem", minWidth: 15, textAlign: "center",
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Thread list */}
      {visibleThreads.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "3rem 1.5rem",
          textAlign: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: ".65rem", opacity: .3 }}>💬</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151", marginBottom: ".3rem" }}>
            {isHeadCoach && threads.length > 0
              ? (hcTab === "forMe" ? "Nothing addressed to you directly" : "No oversight conversations")
              : "No messages yet"}
          </div>
          <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>
            {isHeadCoach && threads.length > 0
              ? (hcTab === "forMe"
                  ? "Conversations you're only auto-included on for oversight show up under Oversight."
                  : "Conversations you're auto-included on for oversight will show up here.")
              : isStaff
                ? "Tap + New to start a conversation with an athlete, parent, or coach."
                : "Your coach will start a conversation with you here."}
          </div>
        </div>
      ) : (
        visibleThreads.map(t => (
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
