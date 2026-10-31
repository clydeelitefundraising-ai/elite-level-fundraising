"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Plus, Shield, Users, Eye, Paperclip } from "lucide-react";
import type { ResolvedMessage } from "@/lib/messages";
import {
  roleLabel, otherParticipants, isFamilyThread, selfParticipantRow,
  isGroupThread, threadDisplayTitle, observerParticipants,
} from "@/app/team/[slug]/messages/_shared/participantDisplay";
import {
  searchRosterAthletes, searchDirectoryEntries, athleteMetaLabel, athleteJoinStatusLabel,
  validateGroupNameClient, MAX_GROUP_NAME_LENGTH, type RosterAthleteEntry,
} from "@/app/team/[slug]/messages/_shared/groupMessaging";
import Avatar from "@/app/team/[slug]/messages/_shared/Avatar";
import { DEMO_TEAM } from "./demoData";
import {
  DEMO_PEOPLE, createGroup, demoDirectory, demoGroupDirectory, markThreadRead, replyInThread, startDirectMessage,
  threadsFor, type DemoPerson, type DemoStore, type DemoThread,
} from "./commsData";

// Communications → Messages and the conversation screen, as the Team App
// renders them on a phone, with fictional threads held in the demo's store.
//
//   reused as-is  participantDisplay (thread titles, family/observer rules,
//                 role labels), groupMessaging (roster search, name
//                 validation, join-status labels), Avatar
//   twins         MessagesView (+ ThreadCard, ComposeModal), CreateGroupModal
//                 (+ GroupParticipantPicker), ThreadView (+ MessageBubble),
//                 AttachmentPickerButton — the real ones fetch directories,
//                 post messages, poll, mark read and navigate with the router.
//
// `primaryColor` is the team's raw primary colour, exactly as the real
// MessagesView/ThreadView receive it (settings.primary_color) — which is
// why the compose sheet and your own message bubbles use it rather than
// the theme's accent.

type Notify = (message?: string) => void;
type SetStore = (fn: (s: DemoStore) => DemoStore) => void;

const primaryColor = DEMO_TEAM.primaryColor;
const personById = (kind: "coach" | "member", personId: string) => DEMO_PEOPLE.find(p => p.kind === kind && p.id === personId)!;

function relativeTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)     return "just now";
  if (sec < 3600)   return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)  return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

// ─── Inbox (twin of messages/MessagesView.tsx) ──────────────────────────────

export function DemoMessagesView({
  store, setStore, me, isStaff, isHeadCoach, canCreateGroup, onOpenThread, notify,
}: {
  store: DemoStore; setStore: SetStore; me: DemoPerson;
  isStaff: boolean; isHeadCoach: boolean; canCreateGroup: boolean;
  onOpenThread: (threadId: string) => void; notify: Notify;
}) {
  const [showCompose, setShowCompose] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [hcTab, setHcTab] = useState<"forMe" | "oversight">("forMe");
  const actorKind = me.kind;
  const actorId = me.id;
  const threads = threadsFor(store, me.key);

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
          <DemoThreadCard key={t.id} thread={t} actorKind={actorKind} actorId={actorId} onClick={() => onOpenThread(t.id)} />
        ))
      )}

      {showCompose && (
        <DemoComposeModal
          isStaff={isStaff}
          onClose={() => setShowCompose(false)}
          onAttach={() => notify("Preview only — attachments aren't uploaded in the demo.")}
          onSend={(to, body) => {
            const r = startDirectMessage(store, me, to, body, new Date().toISOString());
            setStore(() => r.store);
            setShowCompose(false);
            onOpenThread(r.threadId);
            notify("Preview only — this message stays in the demo. Nothing was sent.");
          }}
        />
      )}

      {showCreateGroup && (
        <DemoCreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreate={(name, athleteIds, staffIds) => {
            const r = createGroup(store, me, name, athleteIds, staffIds, new Date().toISOString());
            setStore(() => r.store);
            setShowCreateGroup(false);
            onOpenThread(r.threadId);
            notify("Preview only — the group exists in this demo only. No one was notified.");
          }}
        />
      )}
    </div>
  );
}

// Twin of MessagesView.tsx's ThreadCard.
function DemoThreadCard({ thread, actorKind, actorId, onClick }: { thread: DemoThread; actorKind: "coach" | "member"; actorId: string; onClick: () => void }) {
  const isUnread = thread.unread_count > 0;
  const isGroup = isGroupThread(thread);
  const others = otherParticipants(thread.participants, actorKind, actorId);
  const displayName = threadDisplayTitle(thread, thread.participants, actorKind, actorId);
  const family = !isGroup && isFamilyThread(thread.participants);
  const primaryOther = others[0];
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

// ─── New Message (twin of MessagesView.tsx's ComposeModal) ──────────────────

type RecipientType = "athlete" | "parent" | "coach";
type DirectoryEntry = { id: string; name: string; role: string; photo_url?: string | null };

function DemoComposeModal({ isStaff, onClose, onSend, onAttach }: {
  isStaff: boolean; onClose: () => void; onSend: (to: DemoPerson, body: string) => void; onAttach: () => void;
}) {
  const dir = demoDirectory();
  const [recipientType, setRecipientType] = useState<RecipientType | null>(isStaff ? null : "coach");
  const [recipientId, setRecipientId] = useState("");
  const [search, setSearch] = useState("");
  const [step, setStep] = useState<"recipient" | "message">("recipient");
  const [msgBody, setMsgBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const chooseType = (t: RecipientType) => { setRecipientType(t); setRecipientId(""); setSearch(""); };
  useEffect(() => { if (step === "message") textareaRef.current?.focus(); }, [step]);

  const isAthleteTab = recipientType === "athlete";
  const athletePool = dir.athletes.map(a => ({ id: a.athleteId, ...a }));
  const athleteQuery = search.trim();
  const athleteResults = athleteQuery ? searchRosterAthletes(athletePool, athleteQuery, new Set<string>()) : [];
  const recipients: DirectoryEntry[] = recipientType === "coach" ? dir.coaches : recipientType === "parent" ? dir.parents : [];
  const query = search.trim().toLowerCase();
  const filteredRecipients = query ? recipients.filter(r => r.name.toLowerCase().includes(query)) : recipients;
  const searchLabel = recipientType === "athlete" ? "Search athletes" : recipientType === "parent" ? "Search parents" : "Search coaches";
  const selectedAthlete = isAthleteTab ? athletePool.find(a => a.teamMemberId === recipientId) : undefined;
  const selectedRecipient: DirectoryEntry | undefined = selectedAthlete
    ? { id: selectedAthlete.teamMemberId as string, name: selectedAthlete.name, role: "athlete", photo_url: selectedAthlete.photo_url }
    : recipients.find(r => r.id === recipientId);
  const safetyNote = recipientType === "athlete"
    ? "Parent/guardian will be included. Head coach oversight applies."
    : recipientType === "parent"
      ? "Athlete will be included. Head coach oversight applies."
      : null;

  const handleSend = () => {
    const body = msgBody.trim();
    if (!recipientId || !body) return;
    onSend(personById(recipientType === "coach" ? "coach" : "member", recipientId), body);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
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
                      onClick={() => chooseType(t)}
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
                    {!athleteQuery ? (
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
                    {recipients.length > 0 && (
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
                    {recipients.length === 0 ? (
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

            <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
              <DemoAttachmentButton onClick={onAttach} />
              <button
                onClick={handleSend}
                disabled={!msgBody.trim()}
                style={{
                  flex: 1, padding: ".7rem",
                  background: primaryColor,
                  color: "#fff", border: "none", borderRadius: 10,
                  fontSize: ".9rem", fontWeight: 700,
                  cursor: !msgBody.trim() ? "default" : "pointer",
                  opacity: !msgBody.trim() ? .5 : 1,
                  transition: "opacity .15s",
                }}
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Twin of _shared/AttachmentPickerButton.tsx — without the hidden file
// input (the demo never opens a file chooser).
function DemoAttachmentButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Attach photos, videos, or files"
      title="Attach photos, videos, or files"
      style={{
        background:   "#fff",
        border:       "1.5px solid #e5e7eb",
        borderRadius: 10,
        width:        40,
        height:       40,
        minWidth:     40,
        minHeight:    40,
        flexShrink:   0,
        display:      "flex",
        alignItems:   "center",
        justifyContent: "center",
        fontSize:     "1.15rem",
        cursor:       "pointer",
        opacity:      1,
      }}
    >
      <Paperclip size={17} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

// ─── Create Group (twin of _shared/CreateGroupModal.tsx + GroupParticipantPicker.tsx) ──

function DemoCreateGroupModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, athleteIds: string[], staffIds: string[]) => void }) {
  const [name, setName] = useState("");
  const [rosterAthleteIds, setRosterAthleteIds] = useState<string[]>([]);
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const nameResult = validateGroupNameClient(name);
  const hasParticipant = rosterAthleteIds.length + staffIds.length > 0;
  const canCreate = nameResult.ok && hasParticipant;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom))",
        animation: "elf-backdropIn .18s ease both",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create Group"
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(460px,100%)",
          background: "#fff",
          borderRadius: 18,
          padding: "1.2rem 1rem",
          animation: "elf-modalIn .2s ease both",
          maxHeight: "calc(100dvh - 2rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          display: "flex",
          flexDirection: "column",
          gap: ".9rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#0b1e3d", flex: 1 }}>
            Create Group
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", fontSize: "1.1rem", cursor: "pointer", color: "#9ca3af", lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
          <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#6b7280" }}>Group Name</span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Varsity Jumps"
            aria-label="Group Name"
            maxLength={MAX_GROUP_NAME_LENGTH}
            autoFocus
            style={{
              width: "100%", padding: ".65rem .75rem", borderRadius: 10,
              border: "1.5px solid #e5e7eb", fontSize: "1rem", color: "#374151", boxSizing: "border-box",
            }}
          />
        </label>

        <DemoGroupParticipantPicker
          selectedAthleteIds={rosterAthleteIds}
          selectedStaffIds={staffIds}
          onChange={(a, s) => { setRosterAthleteIds(a); setStaffIds(s); }}
        />

        <button
          onClick={() => canCreate && nameResult.ok && onCreate(nameResult.name, rosterAthleteIds, staffIds)}
          disabled={!canCreate}
          style={{
            width: "100%", padding: ".7rem",
            background: primaryColor, color: "#fff", border: "none", borderRadius: 10,
            fontSize: ".9rem", fontWeight: 700,
            cursor: canCreate ? "pointer" : "default",
            opacity: canCreate ? 1 : .5,
            transition: "opacity .15s",
          }}
        >
          Create Group
        </button>
      </div>
    </div>
  );
}

type StaffEntry = { id: string; name: string; role: string };

function DemoGroupParticipantPicker({ selectedAthleteIds, selectedStaffIds, onChange }: {
  selectedAthleteIds: string[]; selectedStaffIds: string[]; onChange: (athleteIds: string[], staffIds: string[]) => void;
}) {
  const dir = demoGroupDirectory();
  const [query, setQuery] = useState("");
  const athletePool: RosterAthleteEntry[] = dir.athletes;
  const staffPool: StaffEntry[] = dir.staff;
  const athleteById = new Map<string, RosterAthleteEntry>(athletePool.map(a => [a.id, a]));
  const staffById = new Map<string, StaffEntry>(staffPool.map(s => [s.id, s]));
  const athleteResults = searchRosterAthletes(athletePool, query, new Set(selectedAthleteIds));
  const staffResults = searchDirectoryEntries(staffPool, query, new Set(selectedStaffIds));
  const addAthlete = (aid: string) => { onChange([...selectedAthleteIds, aid], selectedStaffIds); setQuery(""); };
  const addStaff = (sid: string) => { onChange(selectedAthleteIds, [...selectedStaffIds, sid]); setQuery(""); };
  const removeAthlete = (aid: string) => onChange(selectedAthleteIds.filter(x => x !== aid), selectedStaffIds);
  const removeStaff = (sid: string) => onChange(selectedAthleteIds, selectedStaffIds.filter(x => x !== sid));
  const hasQuery = query.trim().length > 0;
  const hasAnyResults = athleteResults.length > 0 || staffResults.length > 0;
  const selectedCount = selectedAthleteIds.length + selectedStaffIds.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: ".7rem" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
        <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#6b7280" }}>Add People</span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search athletes or staff..."
          aria-label="Search athletes or staff"
          style={{
            width: "100%", padding: ".55rem .7rem", borderRadius: 10,
            border: "1.5px solid #e5e7eb", fontSize: "1rem", color: "#374151", boxSizing: "border-box",
          }}
        />
      </label>

      {hasQuery && (
        <div role="group" aria-label="Search results" style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
          {!hasAnyResults ? (
            <div style={{ fontSize: ".82rem", color: "#9ca3af" }}>No matching athletes or staff.</div>
          ) : (
            <>
              {athleteResults.length > 0 && (
                <div>
                  <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".3rem" }}>
                    Athletes
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                    {athleteResults.map(a => {
                      const meta = athleteMetaLabel(a.event, a.classYear);
                      const joinStatus = athleteJoinStatusLabel(a.joined);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => addAthlete(a.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: ".6rem",
                            padding: ".5rem .6rem", borderRadius: 10, textAlign: "left",
                            border: "1.5px solid #e5e7eb", background: "#fff", cursor: "pointer", width: "100%",
                          }}
                        >
                          <Avatar name={a.name} photoUrl={null} size={32} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#0b1e3d" }}>{a.name}</div>
                            {meta && <div style={{ fontSize: ".7rem", color: "#9ca3af" }}>{meta}</div>}
                            {joinStatus && <div style={{ fontSize: ".7rem", color: "#9ca3af" }}>{joinStatus}</div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {staffResults.length > 0 && (
                <div>
                  <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".3rem" }}>
                    Staff
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                    {staffResults.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => addStaff(s.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: ".6rem",
                          padding: ".5rem .6rem", borderRadius: 10, textAlign: "left",
                          border: "1.5px solid #e5e7eb", background: "#fff", cursor: "pointer", width: "100%",
                        }}
                      >
                        <Avatar name={s.name} photoUrl={null} size={32} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#0b1e3d" }}>{s.name}</div>
                          <div style={{ fontSize: ".7rem", color: "#9ca3af" }}>{roleLabel(s.role)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {selectedCount > 0 && (
        <div>
          <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".3rem" }}>
            Selected ({selectedCount})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
            {[...selectedAthleteIds.map(x => ({ x, name: athleteById.get(x)?.name ?? "Athlete", remove: removeAthlete })),
              ...selectedStaffIds.map(x => ({ x, name: staffById.get(x)?.name ?? "Staff", remove: removeStaff }))].map(({ x, name, remove }) => (
              <div
                key={x}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem",
                  padding: ".5rem .6rem", borderRadius: 10, border: `1.5px solid ${primaryColor}`, background: "#fff",
                }}
              >
                <span style={{ fontSize: ".85rem", fontWeight: 700, color: "#0b1e3d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {name}
                </span>
                <button
                  type="button"
                  onClick={() => remove(x)}
                  aria-label={`Remove ${name}`}
                  style={{ background: "none", border: "none", color: "#9ca3af", fontSize: "1.1rem", lineHeight: 1, cursor: "pointer", flexShrink: 0, minWidth: 32, minHeight: 32 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Conversation (twin of messages/[threadId]/ThreadView.tsx) ──────────────

function threadTime(iso: string): string {
  const d = new Date(iso);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60)    return "just now";
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(d);
}

function isOwnMessage(msg: ResolvedMessage, actorKind: string, actorId: string): boolean {
  if (actorKind === "coach")  return msg.sender_coach_id  === actorId;
  return msg.sender_member_id === actorId;
}

function DemoMessageBubble({ msg, isSelf, showSenderInfo, onReport }: { msg: ResolvedMessage; isSelf: boolean; showSenderInfo: boolean; onReport: () => void }) {
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
      {!isSelf && (
        <div style={{ width: 28, flexShrink: 0 }}>
          {showSenderInfo && <Avatar name={msg.sender_name} photoUrl={msg.sender_photo_url} size={28} />}
        </div>
      )}

      <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: isSelf ? "flex-end" : "flex-start", gap: ".35rem" }}>
        {!isSelf && showSenderInfo && (
          <span style={{ fontSize: ".65rem", color: "#9ca3af", marginBottom: "-.15rem", fontWeight: 500 }}>
            {msg.sender_name} · {roleLabel(msg.sender_role)}
          </span>
        )}

        <div style={{
          background:   isSelf ? primaryColor : "#fff",
          color:        isSelf ? "#fff" : "#1f2937",
          fontStyle:    "normal",
          border:       "none",
          borderRadius: isSelf ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          padding:      ".6rem .8rem",
          fontSize:     "1rem",
          lineHeight:   1.45,
          boxShadow:    "0 1px 3px rgba(0,0,0,.08)",
          whiteSpace:   "pre-wrap",
          wordBreak:    "break-word",
          overflowWrap: "anywhere",
          maxWidth:     "100%",
        }}>
          {msg.body}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <span style={{ fontSize: ".6rem", color: "#c1c7d0" }}>
            {threadTime(msg.created_at)}
          </span>
          {!isSelf && (
            <button
              onClick={onReport}
              className="elf-focus-ring"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: ".6rem", fontWeight: 600, color: "#c1c7d0" }}
            >
              Report
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function DemoThreadView({ store, setStore, me, threadId, onBack, notify }: {
  store: DemoStore; setStore: SetStore; me: DemoPerson; threadId: string; onBack: () => void; notify: Notify;
}) {
  const thread = store.threads.find(t => t.id === threadId);
  const [replyBody, setReplyBody] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageCount = thread?.messages.length ?? 0;

  // Opening a conversation marks it read for this viewer (locally).
  useEffect(() => {
    setStore(s => markThreadRead(s, threadId, me.key, new Date().toISOString()));
  }, [threadId, me.key, messageCount, setStore]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messageCount]);

  if (!thread) return null;
  const actorKind = me.kind;
  const actorId = me.id;
  const participants = thread.participants;
  const messages = thread.messages;
  const isGroup = isGroupThread(thread);
  const others = otherParticipants(participants, actorKind, actorId);
  const observers = observerParticipants(participants);
  const family = !isGroup && isFamilyThread(participants);
  const displayName = threadDisplayTitle(thread, participants, actorKind, actorId);
  const primaryOther = others[0];
  const canManageGroup = isGroup && thread.created_by_coach_id === me.id;
  const canSend = replyBody.trim().length > 0;

  const handleSend = () => {
    const body = replyBody.trim();
    if (!body) return;
    setStore(s => replyInThread(s, thread.id, me, body, new Date().toISOString()));
    setReplyBody("");
    notify("Preview only — this message stays in the demo. Nothing was sent.");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100dvh - 140px)", animation: "elf-fadeUp .22s ease both" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: ".6rem",
        marginBottom: ".5rem", paddingBottom: ".65rem",
        borderBottom: "1px solid #e5e7eb",
      }}>
        <button
          onClick={onBack}
          aria-label="Back to messages"
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: "1.2rem", color: "#6b7280", padding: ".2rem .3rem",
            lineHeight: 1, borderRadius: 6, flexShrink: 0,
          }}
        >
          ←
        </button>
        {isGroup ? (
          <Avatar name={displayName} photoUrl={null} size={36} />
        ) : (
          primaryOther && <Avatar name={primaryOther.name} photoUrl={primaryOther.photo_url} size={36} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 800, fontSize: ".95rem", color: "#0b1e3d",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {displayName}
          </div>
        </div>

        {isGroup ? (
          canManageGroup && (
            <button
              onClick={() => notify("Preview only — Manage Group (rename, add or remove people) isn't part of the demo.")}
              aria-label="Manage Group"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".78rem", fontWeight: 700, color: primaryColor, padding: ".3rem .5rem", lineHeight: 1, borderRadius: 6, flexShrink: 0 }}
            >
              Manage
            </button>
          )
        ) : (
          primaryOther && (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Conversation options"
              aria-haspopup="true"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem", color: "#6b7280", padding: ".2rem .4rem", lineHeight: 1, borderRadius: 6 }}
            >
              •••
            </button>
            {menuOpen && (
              <div
                role="menu"
                style={{ position: "absolute", right: 0, top: "100%", marginTop: ".25rem", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,.12)", zIndex: 50, minWidth: 160 }}
              >
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); notify("Preview only — in the real app, reports go to the team's coaches and ELF."); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: ".55rem .8rem", background: "none", border: "none", cursor: "pointer", fontSize: ".82rem", color: "#374151" }}
                >
                  Report {primaryOther.name}
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); notify("Preview only — blocking isn't part of the demo."); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: ".55rem .8rem", background: "none", border: "none", cursor: "pointer", fontSize: ".82rem", color: "#dc2626" }}
                >
                  Block {primaryOther.name}
                </button>
              </div>
            )}
          </div>
          )
        )}
      </div>

      {(family || observers.length > 0) && (
        <div style={{
          display: "flex", flexDirection: "column", gap: ".2rem",
          marginBottom: ".65rem", fontSize: ".72rem", color: "#6b7280",
        }}>
          {family && (
            <div style={{ display: "flex", alignItems: "center", gap: ".3rem" }}>
              <Shield size={13} strokeWidth={2} aria-hidden="true" />
              <span>Parent/guardian included</span>
            </div>
          )}
          {observers.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: ".3rem" }}>
              <Eye size={13} strokeWidth={2} aria-hidden="true" />
              <span>{observers.map(o => o.name).join(", ")} included for oversight</span>
            </div>
          )}
        </div>
      )}

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
              <DemoMessageBubble
                key={m.id}
                msg={m}
                isSelf={isOwnMessage(m, actorKind, actorId)}
                showSenderInfo={!sameSenderAsPrev}
                onReport={() => notify("Preview only — in the real app, reports go to the team's coaches and ELF.")}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{
        borderTop: "1px solid #e5e7eb",
        paddingTop: ".75rem",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        marginTop: ".75rem",
        position: "sticky",
        bottom: "5.5rem",
        background: "#f5f6f8",
      }}>
        <div style={{ display: "flex", gap: ".5rem", alignItems: "flex-end" }}>
          <DemoAttachmentButton onClick={() => notify("Preview only — attachments aren't uploaded in the demo.")} />
          <textarea
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSend(); } }}
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
            disabled={!canSend}
            aria-label="Send message"
            style={{
              padding: ".55rem .9rem",
              background: primaryColor,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: ".82rem",
              fontWeight: 700,
              cursor: canSend ? "pointer" : "default",
              opacity: canSend ? 1 : .45,
              transition: "opacity .15s",
              flexShrink: 0,
              minHeight: 40,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
