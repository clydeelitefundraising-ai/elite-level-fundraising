"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Plus, Shield, Users } from "lucide-react";
import type { ThreadWithDetails } from "@/lib/messages";
import {
  roleLabel, otherParticipants, isFamilyThread, selfParticipantRow,
  isGroupThread, threadDisplayTitle,
} from "./_shared/participantDisplay";
import {
  searchRosterAthletes, athleteMetaLabel, athleteJoinStatusLabel, type RosterAthleteEntry,
} from "./_shared/groupMessaging";
import Avatar from "./_shared/Avatar";
import AttachmentPickerButton from "./_shared/AttachmentPickerButton";
import AttachmentComposerBar from "./_shared/AttachmentComposerBar";
import { useSelectedAttachments } from "./_shared/useSelectedAttachments";
import { uploadMessageAttachments } from "./_shared/uploadMessageAttachments";
import CreateGroupModal from "./_shared/CreateGroupModal";

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
  onClick,
}: {
  thread: ThreadWithDetails;
  actorKind: string;
  actorId: string;
  onClick: () => void;
}) {
  const isUnread = thread.unread_count > 0;
  const isGroup = isGroupThread(thread);
  const others = otherParticipants(thread.participants, actorKind as "coach" | "member", actorId);
  const displayName = threadDisplayTitle(thread, thread.participants, actorKind as "coach" | "member", actorId);
  const family = !isGroup && isFamilyThread(thread.participants);
  // Avatar: the single most prominent other participant. Falls back to a
  // generic conversation icon only in the edge case of no other
  // participants resolving (shouldn't normally happen).
  const primaryOther = others[0];
  // Phase 6: flattened from a floating card to a row + bottom divider, same
  // treatment as UpdateCard.tsx. The `primaryColor` prop (threaded raw from
  // settings.primary_color, not the branding-aware var(--team-primary) CSS
  // variable) is no longer used for the unread accent/badge here — switched
  // to the token so this respects branding_customized like every other
  // surface already does (Home's fundraising-bar fix, same class of issue).
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className="elf-focus-ring"
      style={{
        borderLeft:   `3px solid ${isUnread ? "var(--team-primary)" : "transparent"}`,
        borderBottom: "1px solid var(--border-app)",
        padding:      ".75rem .85rem .75rem .75rem",
        cursor:       "pointer",
        display:      "flex",
        gap:          ".7rem",
        alignItems:   "flex-start",
      }}
    >
      {isGroup ? (
        <Avatar name={displayName} photoUrl={null} size={36} />
      ) : primaryOther ? (
        <Avatar name={primaryOther.name} photoUrl={primaryOther.photo_url} size={36} />
      ) : (
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: "var(--surface-light-elevated)", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, color: "var(--text-muted-app)",
        }}>
          <MessageCircle size={16} aria-hidden="true" />
        </div>
      )}

      {/* Content — participant name(s) are the PRIMARY identity for a DM. A
          group uses its own group_name instead (threadDisplayTitle, never
          derived from participants). A legacy subject (only present on
          threads created before Phase 2B, DM-only — groups never set it)
          appears as small secondary context underneath, never as the
          primary line. */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: ".4rem" }}>
          <span style={{
            fontWeight: isUnread ? 800 : 600,
            fontSize:   ".88rem",
            color:      "var(--text-primary-app)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {displayName}
          </span>
          <span style={{ fontSize: ".65rem", color: "var(--text-muted-app)", flexShrink: 0 }}>
            {relativeTime(thread.last_message_at)}
          </span>
        </div>
        {/* G3B review correction: a group's people count is intentionally
            NOT shown here. thread.participants.length (all this inbox row
            has) undercounts a roster-only, never-joined assigned athlete —
            showing it, under any wording, would be a known-inaccurate
            number. The accurate count (countGroupPeople, which needs BOTH
            roster assignments and participants) is only available in
            Manage Group. Fixing this would require getThreadsForActor — a
            hot, frequently-polled list across potentially many threads —
            to also batch-query message_thread_athletes per group thread;
            left as flagged future work rather than a second fetch here or
            a misleading display. */}
        {!isGroup && thread.subject && (
          <span style={{ fontSize: ".68rem", color: "var(--text-muted-app)", display: "block", marginBottom: ".1rem", fontStyle: "italic" }}>
            {thread.subject}
          </span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: ".35rem" }}>
          <span style={{
            fontSize: ".77rem",
            color: isUnread ? "var(--text-primary-app)" : "var(--text-muted-app)",
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
              padding: ".05rem .28rem", borderRadius: "var(--radius-full)", flexShrink: 0,
            }}>
              Family
            </span>
          )}
          {isUnread && (
            <span
              aria-label={`${thread.unread_count} unread message${thread.unread_count !== 1 ? "s" : ""}`}
              style={{
                background: "var(--team-primary)", color: "var(--team-primary-foreground)",
                borderRadius: "var(--radius-full)", fontSize: ".55rem", fontWeight: 700,
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
// G3C bugfix — the Athlete tab's entries are no longer joined-only
// team_members rows. athleteId (athletes.id) is ALWAYS present (used for
// display/search/keys); teamMemberId (team_members.id) is the ONLY field
// that may ever be sent back to the server as a DM recipient_id, and is
// null for a roster athlete who hasn't joined ELF yet.
type DmAthleteEntry = {
  athleteId: string;
  teamMemberId: string | null;
  name: string;
  event: string | null;
  classYear: string | null;
  joined: boolean;
  photo_url: string | null;
};
// Satisfies groupMessaging.ts's RosterAthleteEntry (id/name/event/classYear/
// joined) via its `id` alias of athleteId, so searchRosterAthletes() can be
// reused as-is — never a second, duplicated search implementation for this
// surface.
type DmAthleteSearchEntry = RosterAthleteEntry & DmAthleteEntry;
type Directory = { coaches: DirectoryEntry[]; athletes: DmAthleteEntry[]; parents: DirectoryEntry[] };

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
  // G3C bugfix — same fetchFailed distinction already shipped for the Group
  // picker (GroupParticipantPicker.tsx): a failed directory fetch previously
  // left `dir` null forever, rendering an indefinite "Loading…" rather than
  // a retryable error. Scoped to the Athlete tab's own render branch below —
  // Parent/Coach tabs are explicitly left exactly as they were.
  const [fetchFailed, setFetchFailed] = useState(false);
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
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`directory fetch failed: ${r.status}`))))
      .then(d => setDir(d))
      .catch(() => setFetchFailed(true));
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

  const isAthleteTab = recipientType === "athlete";

  // G3C bugfix — the Athlete tab is search-first over the FULL roster
  // (joined or not). teamMemberId is the only field ever written into
  // recipientId; an unjoined athlete's row never produces one.
  const athletePool: DmAthleteSearchEntry[] = (dir?.athletes ?? []).map(a => ({ id: a.athleteId, ...a }));
  const athleteQuery = search.trim();
  const athleteResults = athleteQuery ? searchRosterAthletes(athletePool, athleteQuery, new Set<string>()) : [];

  // Parent/Coach tabs — UNCHANGED data source, shape, and non-search-first
  // (always-shown) behavior.
  const recipients: DirectoryEntry[] = recipientType === "coach"
    ? (dir?.coaches ?? [])
    : recipientType === "parent"
      ? (dir?.parents ?? [])
      : [];

  const query = search.trim().toLowerCase();
  const filteredRecipients = query
    ? recipients.filter(r => r.name.toLowerCase().includes(query))
    : recipients;

  const searchLabel = recipientType === "athlete" ? "Search athletes"
    : recipientType === "parent" ? "Search parents"
    : "Search coaches";

  // G3C bugfix: an athlete recipient's id is now teamMemberId, resolved
  // from athletePool (not `recipients`, which the Athlete tab no longer
  // populates) and reshaped into the same DirectoryEntry display shape
  // Step 2's header already expects.
  const selectedAthlete = isAthleteTab ? athletePool.find(a => a.teamMemberId === recipientId) : undefined;
  const selectedRecipient: DirectoryEntry | undefined = selectedAthlete
    ? { id: selectedAthlete.teamMemberId as string, name: selectedAthlete.name, role: "athlete", photo_url: selectedAthlete.photo_url }
    : recipients.find(r => r.id === recipientId);
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

                {isAthleteTab ? (
                  <>
                    {/* G3C bugfix — search-first over the FULL roster. The
                        search box itself is hidden only when there's
                        genuinely no roster to search (distinct from "roster
                        exists but search hasn't started yet", which shows
                        the box plus a neutral prompt below). */}
                    {dir && athletePool.length > 0 && (
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
                    {fetchFailed ? (
                      <div role="alert" style={{ fontSize: ".82rem", color: "#dc2626" }}>
                        Couldn&apos;t load the roster. Try again.
                      </div>
                    ) : !dir ? (
                      <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>Loading…</div>
                    ) : athletePool.length === 0 ? (
                      <div style={{ fontSize: ".82rem", color: "#9ca3af" }}>No athletes are on the roster yet.</div>
                    ) : !athleteQuery ? (
                      <div style={{ fontSize: ".82rem", color: "#9ca3af" }}>Search your roster to message an athlete.</div>
                    ) : athleteResults.length === 0 ? (
                      <div style={{ fontSize: ".82rem", color: "#9ca3af", padding: ".4rem 0" }}>No matching athletes.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
                        {athleteResults.map(a => {
                          const selectable = a.teamMemberId !== null;
                          const active = selectable && a.teamMemberId === recipientId;
                          const meta = athleteMetaLabel(a.event, a.classYear);
                          const joinStatus = athleteJoinStatusLabel(a.joined);
                          return (
                            <button
                              key={a.athleteId}
                              type="button"
                              disabled={!selectable}
                              aria-disabled={!selectable}
                              onClick={() => selectable && setRecipientId(a.teamMemberId as string)}
                              style={{
                                display: "flex", alignItems: "center", gap: ".6rem",
                                padding: ".5rem .6rem", borderRadius: 10, textAlign: "left",
                                border: `1.5px solid ${active ? primaryColor : "#e5e7eb"}`,
                                background: active ? `${primaryColor}12` : "#fff",
                                cursor: selectable ? "pointer" : "default",
                              }}
                            >
                              <Avatar name={a.name} photoUrl={a.photo_url} size={34} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#0b1e3d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {a.name}
                                </div>
                                {meta && <div style={{ fontSize: ".7rem", color: "#9ca3af" }}>{meta}</div>}
                                {joinStatus && <div style={{ fontSize: ".7rem", color: "#9ca3af" }}>{joinStatus}</div>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <>
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
                  </>
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
                <Shield size={13} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, marginTop: "1px" }} />
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
  // Group Messaging G2 — true only for a REAL team_coaches row with role
  // head_coach or assistant_coach (never booster, never a platform admin —
  // see the G1 server's own authorization, which this must match exactly
  // since this boolean only controls UI visibility; the server remains
  // authoritative regardless of what this prop says). Computed by the
  // server page (CommunicationsView's own caller) from the actual
  // TeamActor, never inferred client-side from isStaff/isHeadCoach, which
  // both admit booster/platform_admin in ways this must not.
  canCreateGroup = false,
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
  canCreateGroup?: boolean;
  primaryColor: string;
  onUnreadChange?: (count: number) => void;
}) {
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadWithDetails[]>(initialThreads);
  const [showCompose, setShowCompose] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
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
            fontSize: ".58rem", fontWeight: 700, color: "var(--text-muted-app)",
            textTransform: "uppercase", letterSpacing: ".1em", display: "block",
          }}>
            Private
          </span>
          <h2 style={{
            margin: 0, fontSize: "1.1rem", fontWeight: 800,
            color: "var(--text-primary-app)", letterSpacing: "-.01em",
          }}>
            Messages
          </h2>
        </div>
        <div style={{ display: "flex", gap: ".4rem" }}>
          <button
            onClick={() => setShowCompose(true)}
            aria-label="Start a new message"
            className="elf-focus-ring"
            style={{
              background: "var(--team-primary)", color: "var(--team-primary-foreground)",
              border: "none", borderRadius: "var(--radius-md)",
              padding: ".4rem .85rem",
              fontSize: ".78rem", fontWeight: 700,
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: ".3rem",
            }}
          >
            <Plus size={14} aria-hidden="true" /> New
          </button>
          {/* Group Messaging G2 — coach-only entry point. Visibility is a
              UX convenience only; the G1 server endpoint independently
              enforces the exact same head_coach/assistant_coach-only rule
              regardless of what this button shows, so there's no way to
              reach group creation by forging this prop. */}
          {canCreateGroup && (
            <button
              onClick={() => setShowCreateGroup(true)}
              aria-label="Create a new group"
              className="elf-focus-ring"
              style={{
                background: "#fff", color: "var(--team-primary)",
                border: "1.5px solid var(--team-primary)", borderRadius: "var(--radius-md)",
                padding: ".4rem .85rem",
                fontSize: ".78rem", fontWeight: 700,
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: ".3rem",
              }}
            >
              <Users size={14} aria-hidden="true" /> New Group
            </button>
          )}
        </div>
      </div>

      {/* Head Coach only: For Me / Oversight — separates threads where this
          Head Coach is a normal participant from ones they're only
          auto-included on for oversight. Never shown to non-Head-Coach
          users, who keep the plain list below. */}
      {isHeadCoach && threads.length > 0 && (
        <div role="tablist" aria-label="Message ownership" style={{
          display: "flex", gap: "1.1rem", marginBottom: ".9rem",
          borderBottom: "1px solid var(--border-app)",
        }}>
          {([
            { id: "forMe" as const, label: "For Me", count: forMeUnread },
            { id: "oversight" as const, label: "Oversight", count: oversightUnread },
          ]).map(tab => {
            const active = hcTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => setHcTab(tab.id)}
                className="elf-focus-ring"
                style={{
                  display: "flex", alignItems: "center", gap: ".35rem",
                  background: "none",
                  border: "none",
                  borderBottom: active ? "2px solid var(--team-primary)" : "2px solid transparent",
                  padding: "0 0 .5rem",
                  fontSize: ".78rem", fontWeight: active ? 700 : 500,
                  color: active ? "var(--text-primary-app)" : "var(--text-muted-app)",
                  cursor: "pointer",
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span style={{
                    background: active ? "var(--team-primary)" : "var(--text-muted-app)", color: "#fff",
                    borderRadius: "var(--radius-full)", fontSize: ".62rem", fontWeight: 700,
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
          background: "var(--surface-light)", borderRadius: "var(--radius-md)", padding: "3rem 1.5rem",
          textAlign: "center",
          border: "1px solid var(--border-app)",
        }}>
          <MessageCircle size={28} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-muted-app)", opacity: .5, marginBottom: ".65rem" }} />
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-primary-app)", marginBottom: ".3rem" }}>
            {isHeadCoach && threads.length > 0
              ? (hcTab === "forMe" ? "Nothing addressed to you directly" : "No oversight conversations")
              : "No messages yet"}
          </div>
          <div style={{ fontSize: ".8rem", color: "var(--text-muted-app)" }}>
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

      {showCreateGroup && (
        <CreateGroupModal
          slug={slug}
          primaryColor={primaryColor}
          onClose={() => setShowCreateGroup(false)}
          onCreated={threadId => { setShowCreateGroup(false); handleCreated(threadId); }}
        />
      )}
    </div>
  );
}
